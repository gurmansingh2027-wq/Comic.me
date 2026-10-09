// Continuity Ledger: the persistent state of a comic, panel by panel. Who is in frame (at which
// age, wearing what, inside which vehicle), which canon objects are visible (in which state),
// where and when we are, which way things travel, who is ahead, and which earlier panel each one
// continues from. Built from the storyboard + Character Bible + Object Bible, before drawing.
//
// It also LINTS the storyboard for free (no AI calls) and fixes what it safely can: duplicate
// people, vehicles whose driver is missing, direction flips inside an action sequence, age
// changes mid-scene, canon objects mentioned but not listed. What it can't fix is passed to the
// art prompt and to visual QA.
//
// Type-only imports keep this module pure, so `node --test` can run it directly.

import type { CanonObject, CastMember, Complexity, ComicScript, LookPolicy, Motion, Panel, PanelCast } from "./comic";
import type { FailureClass } from "./qa/failure-classes";
import { physicsConflicts } from "./vehicle-physics";

export type LedgerPerson = {
  name: string;
  stage: string;
  /** What they must wear in this panel, after applying the character's look policy. */
  wardrobe: string;
  /** True when the outfit must be copied from their design sheet (keep / ask without an approved change). */
  wardrobeFromSheet: boolean;
  inside?: { objectId: string; position: string };
  /** Added by the ledger (e.g. the owner driving a vehicle in frame), not by the writer. */
  inferred?: boolean;
};

export type LedgerObject = { id: string; name: string; state?: string; position?: string };

export type LedgerEntry = {
  key: string;
  pageIndex: number;
  panelIndex: number;
  sequence?: string;
  location: string;
  people: LedgerPerson[];
  objects: LedgerObject[];
  /** Effective motion: the panel's own, or inherited from its action sequence. */
  motion?: Motion;
  /** Effective complexity: the director's estimate, raised by our own rules when the shot is riskier. */
  complexity: Complexity;
  /** The earlier panel this one continues (same scene or sequence): drawn first, used as a reference. */
  continuesFrom?: string;
};

export type LintIssue = { key: string; failure: FailureClass; severity: "hard" | "soft"; message: string; fixed: boolean };

const ORDER: Complexity[] = ["low", "medium", "high", "very_high"];
const maxComplexity = (a: Complexity, b: Complexity): Complexity => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);
const norm = (text: string) => text.normalize("NFKC").toLowerCase().trim();
const keyFor = (p: number, i: number) => `${p + 1}-${i + 1}`;

/** Words that identify an object in free text ("Gunit's Huracan" → "huracan"; "the GT-R" → "gt-r"). */
function objectTokens(object: Pick<CanonObject, "name" | "owner">): string[] {
  const stop = new Set(["the", "a", "an", "his", "her", "their", "my", "car", "bike", "of", "and"]);
  const owner = object.owner ? norm(object.owner) : "";
  return norm(object.name)
    .replace(/['’]s\b/g, "")
    .split(/[^a-z0-9-]+/)
    .filter((word) => word.length > 2 && !stop.has(word) && !owner.split(/\s+/).includes(word));
}

function mentions(text: string, object: Pick<CanonObject, "name" | "owner">): boolean {
  const haystack = norm(text);
  return objectTokens(object).some((token) => new RegExp(`(^|[^a-z0-9])${token.replace(/[-]/g, "\\-")}([^a-z0-9]|$)`).test(haystack));
}

/** Heuristic risk of a shot, from the facts (not the director's opinion). */
export function ruleComplexity(panel: Panel, people: LedgerPerson[], objects: LedgerObject[], kinds: Map<string, CanonObject["kind"]>): Complexity {
  const text = norm(`${panel.scene} ${panel.context?.camera ?? ""}`);
  const vehicles = objects.filter((object) => kinds.get(object.id) === "vehicle").length;
  const occupantsVisible = people.filter((person) => person.inside).length;
  const moving = panel.context?.motion && panel.context.motion.direction !== "static";
  let score = 0;
  if (vehicles >= 2) score += 2;
  else if (vehicles === 1) score += 1;
  if (vehicles >= 1 && occupantsVisible >= 1) score += 1;
  if (moving) score += 1;
  if (/\b(drift|spin|sideways|skid|crash|collid|jump|flip)/.test(text)) score += 1;
  if (/\b(top-down|aerial|bird'?s-eye|overhead|interchange|cloverleaf|flyover)/.test(text)) score += 1;
  if (/\b(smoke|crowd|reflection|mirror|rain|explosion)/.test(text)) score += 1;
  if (/\b(extreme|worm'?s-eye|fisheye|dutch)/.test(text)) score += 1;
  return score >= 6 ? "very_high" : score >= 4 ? "high" : score >= 2 ? "medium" : "low";
}

/** The outfit rule for one person in one panel, after their look policy. */
export function applyLookPolicy(person: PanelCast, policy: LookPolicy | undefined): { wardrobe: string; fromSheet: boolean } {
  if (policy === "keep") return { wardrobe: "their approved outfit, exactly as on their design sheet for this age", fromSheet: true };
  if (policy === "ask") {
    if (person.lookChange && person.lookChangeReviewed && person.lookChangeApproved) return { wardrobe: person.lookChange, fromSheet: false };
    return { wardrobe: "their approved outfit, exactly as on their design sheet for this age", fromSheet: true };
  }
  return { wardrobe: person.wardrobe || "clothes that fit the scene", fromSheet: false };
}

/**
 * Builds the ledger and lints the storyboard. Returns a FIXED copy of the script (safe automatic
 * fixes applied), the per-panel ledger and the issues found.
 */
export function buildLedger(
  script: ComicScript,
  cast: CastMember[] = [],
  objects: CanonObject[] = [],
): { script: ComicScript; entries: LedgerEntry[]; issues: LintIssue[] } {
  const issues: LintIssue[] = [];
  const entries: LedgerEntry[] = [];
  const kinds = new Map(objects.map((object) => [object.id, object.kind]));
  const byName = (name: string) => cast.find((member) => norm(member.name) === norm(name));
  const sequenceMotion = new Map<string, Motion>();
  /** Where we last saw each person (age and clothes), for people the ledger has to add. */
  const occupants = new Map<string, LedgerPerson[]>();
  const objectStates = new Map<string, string>();
  let previous: { key: string; location: string; event: string; period: string; time: string; sequence?: string; people: LedgerPerson[] } | undefined;

  const pages = script.pages.map((page, p) => ({
    ...page,
    panels: page.panels.map((original, i) => {
      const key = keyFor(p, i);
      const panel: Panel = structuredClone(original);
      const context = panel.context;
      if (!context) {
        entries.push({ key, pageIndex: p, panelIndex: i, location: "", people: [], objects: [], complexity: panel.complexity ?? "medium", continuesFrom: previous?.key });
        previous = { key, location: "", event: "", period: "", time: "", people: [] };
        return panel;
      }

      // 1. Canon objects mentioned in the scene but not listed → list them.
      const canon = [...(context.canon ?? [])].filter((entry) => {
        if (kinds.has(entry.id)) return true;
        issues.push({ key, failure: "OBJECT_IDENTITY_DRIFT", severity: "hard", message: `Unknown object id "${entry.id}". Choose an approved object.`, fixed: false });
        return false;
      });
      for (const object of objects) {
        if (!canon.some((entry) => entry.id === object.id) && mentions(`${panel.scene} ${context.objects.join(" ")}`, object)) {
          canon.push({ id: object.id });
          issues.push({ key, failure: "OBJECT_IDENTITY_DRIFT", severity: "soft", message: `${object.name} is in the scene but wasn't listed as canon: added`, fixed: true });
        }
      }
      context.canon = canon;

      // 2. One appearance per named person.
      const seen = new Set<string>();
      context.cast = context.cast.filter((person) => {
        const id = norm(person.name);
        if (seen.has(id)) {
          issues.push({ key, failure: "DUPLICATE_CHARACTER", severity: "hard", message: `${person.name} was listed twice: merged`, fixed: true });
          return false;
        }
        seen.add(id);
        return true;
      });

      // 3. Occupants must point at a vehicle in frame.
      for (const person of context.cast) {
        if (person.inside && !canon.some((entry) => entry.id === person.inside!.objectId)) {
          if (kinds.has(person.inside.objectId)) {
            canon.push({ id: person.inside.objectId });
            issues.push({ key, failure: "WRONG_OCCUPANT", severity: "soft", message: `${person.name} is inside ${person.inside.objectId}, which wasn't listed: added`, fixed: true });
          } else {
            issues.push({ key, failure: "WRONG_OCCUPANT", severity: "hard", message: `Unknown occupied object ${person.inside.objectId}.`, fixed: false });
          }
        }
      }

      const continuous = !!previous && !context.transition && norm(context.period) === previous.period && norm(context.timeOfDay) === previous.time &&
        ((context.sequence && context.sequence === previous.sequence) || (norm(context.location) === previous.location && norm(context.event) === previous.event && previous.location !== ""));
      if (!continuous) occupants.clear();
      // Carry only explicitly established occupancy across a continuous moving sequence.
      // Anyone now shown outside, or any replacement driver, overrides this inherited state.
      const inferred = new Set<string>();
      for (const object of canon) {
        if (context.motion?.direction === "static" || /\b(parked|empty|unattended|abandoned)\b/i.test(panel.scene)) { occupants.delete(object.id); continue; }
        const explicit = context.cast.filter(person => person.inside?.objectId === object.id);
        if (explicit.length) { occupants.delete(object.id); continue; }
        for (const person of occupants.get(object.id) ?? []) {
          if (context.cast.some(current => norm(current.name) === norm(person.name))) continue;
          context.cast.push({ name: person.name, stage: person.stage, wardrobe: person.wardrobe, emotion: "", action: "occupying the same seat if visible", inside: person.inside });
          inferred.add(norm(person.name));
        }
      }
      // Occupancy is explicit. Ownership alone never establishes a driver.
      for (const object of canon) {
        const drivers = context.cast.filter(person => person.inside?.objectId === object.id && /driv|wheel/i.test(person.inside.position));
        if (drivers.length > 1) issues.push({ key, failure: "WRONG_OCCUPANT", severity: "hard", message: `Choose one driver for ${object.id}.`, fixed: false });
      }

      // 5. Screen direction: inherit along a sequence; flag flips that aren't deliberate.
      if (context.sequence) {
        if (context.transition || (previous && (norm(context.period) !== previous.period || norm(context.timeOfDay) !== previous.time))) sequenceMotion.delete(context.sequence);
        const established = sequenceMotion.get(context.sequence);
        const own = context.motion;
        if (!own && established) {
          context.motion = { ...established };
        } else if (own && established && !context.axisChange) {
          const lateral = (d: Motion["direction"]) => d === "left-to-right" || d === "right-to-left";
          if (lateral(own.direction) && lateral(established.direction) && own.direction !== established.direction) {
            issues.push({ key, failure: "WRONG_SCREEN_DIRECTION", severity: "hard", message: `Travel flips ${established.direction} → ${own.direction} inside "${context.sequence}" without an explicit camera crossing or transition.`, fixed: false });

          }
        }
        if (context.motion && context.motion.direction !== "static") {
          context.motion = { ...established, ...context.motion };
          sequenceMotion.set(context.sequence, context.motion);
        }
      }

      const people: LedgerPerson[] = context.cast.map((person) => {
        const member = byName(person.name);
        if (continuous) {
          const before = previous!.people.find((candidate) => norm(candidate.name) === norm(person.name));
          if (before && before.stage !== person.stage && (member?.stages?.length ?? 0) > 0) {
            issues.push({ key, failure: "WRONG_LIFE_STAGE", severity: "hard", message: `${person.name} changes age mid-scene. Describe the time transition before drawing.`, fixed: false });

          }
          if (before && !before.wardrobeFromSheet && member?.lookPolicy !== "keep" && member?.lookPolicy !== "ask" && person.wardrobe && before.wardrobe && norm(before.wardrobe) !== norm(person.wardrobe)) {
            issues.push({ key, failure: "WARDROBE_UNINTENDED_CHANGE", severity: "soft", message: `${person.name}'s clothes change mid-scene ("${before.wardrobe}" → "${person.wardrobe}")`, fixed: false });
          }
        }
        const look = applyLookPolicy(person, member?.lookPolicy);
        if (person.stage && !member?.stages?.some(stage => stage.id === person.stage)) issues.push({ key, failure: "WRONG_LIFE_STAGE", severity: "hard", message: `Choose an approved age for ${person.name}.`, fixed: false });
        if (member?.lookPolicy === "ask" && person.lookChange && !person.lookChangeReviewed) issues.push({ key, failure: "WARDROBE_UNINTENDED_CHANGE", severity: "hard", message: `Review ${person.name}'s proposed look change.`, fixed: false });
        return { name: person.name, stage: person.stage, wardrobe: look.wardrobe, wardrobeFromSheet: look.fromSheet, inside: person.inside, inferred: inferred.has(norm(person.name)) || undefined };
      });

      for (const object of canon) {
        const present = people.filter(person => person.inside?.objectId === object.id);
        if (present.length) occupants.set(object.id, present);
        const definition = objects.find(item => item.id === object.id);
        if (object.state && object.state !== "as-designed" && !definition?.states?.some(state => state.id === object.state)) {
          issues.push({ key, failure: "OBJECT_IDENTITY_DRIFT", severity: "hard", message: `Unknown state ${object.state} for ${object.id}.`, fixed: false });
        }
        if (object.state === "as-designed") objectStates.delete(object.id);
        if (object.state) objectStates.set(object.id, object.state);
        else object.state = objectStates.get(object.id);
      }
      const ledgerObjects: LedgerObject[] = canon.map((entry) => ({ id: entry.id, name: objects.find((o) => o.id === entry.id)?.name ?? entry.id, state: entry.state, position: entry.position }));
      const complexity = maxComplexity(panel.complexity ?? "low", ruleComplexity(panel, people, ledgerObjects, kinds));
      if (complexity !== panel.complexity) panel.complexity = complexity;

      const entry: LedgerEntry = {
        key,
        pageIndex: p,
        panelIndex: i,
        sequence: context.sequence,
        location: context.location,
        people,
        objects: ledgerObjects,
        motion: context.motion,
        complexity,
        continuesFrom: continuous ? previous!.key : undefined,
      };
      entries.push(entry);
      // Contradiction check: a pose that's impossible at this speed is drawn from inside the cabin instead.
      for (const conflict of physicsConflicts(panel, entry)) {
        issues.push({ key, failure: "IMPOSSIBLE_POSE", severity: "soft", message: `${conflict.person} "${conflict.pose}" while the car is ${conflict.speed}: it will be drawn from inside the cabin. To keep it, stop or slow the car in this panel.`, fixed: true });
      }
      previous = { key, location: norm(context.location), event: norm(context.event), period: norm(context.period), time: norm(context.timeOfDay), sequence: context.sequence, people };
      return panel;
    }),
  }));

  return { script: { ...script, pages }, entries, issues };
}

/** The ledger entry for one picture key ("3-2"), or undefined for the cover. */
export function ledgerEntry(entries: LedgerEntry[], key: string): LedgerEntry | undefined {
  return entries.find((entry) => entry.key === key);
}
