import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { askClaude, imageBlock } from "../claude";
import type { CanonObject, Complexity, ComicScript, Panel } from "../comic";
import type { LedgerEntry } from "../continuity";
import type { ComicStyle } from "../styles";
import { driverSideNote } from "../engines/art";
import { FAILURE_CLASS_IDS, FAILURE_CLASSES, failureGuide, isHard, type FailureClass } from "./failure-classes";

// Visual QA: a multimodal inspector that looks at a generated picture BEFORE it's accepted,
// with the storyboard intent, the Continuity Ledger, the canon sheets and the previous panel.
// It returns structured findings, and `decide` turns them into ACCEPT / RETRY / SIMPLIFY /
// ESCALATE / FLAG. Same model as the rest of the app (Claude Opus 5.5); cost is controlled by
// effort (low for the routine pass, high to escalate) and by small, downscaled images.

export const DIMENSIONS = [
  "CHARACTER_IDENTITY",
  "LIFE_STAGE",
  "WARDROBE",
  "VEHICLE_IDENTITY",
  "OBJECT_IDENTITY",
  "SCENE_MATCH",
  "ACTION_MATCH",
  "POSE_ANATOMY",
  "PHYSICS",
  "ROAD_GEOMETRY",
  "OCCLUSION",
  "SCREEN_DIRECTION",
  "CAMERA_CONTINUITY",
  "STYLE",
] as const;

/**
 * The SDK sends enums to Claude as hints, not grammar, so an answer can contain a label that isn't
 * on the list. One unknown label must not throw away the whole inspection: it falls back to a safe
 * value (unknown failures count as a hard SCENE_MISMATCH, so nothing wrong slips through). The JSON
 * schema Claude sees is unchanged.
 */
const lenient = <const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z.preprocess((value) => ((values as readonly unknown[]).includes(value) ? value : fallback), z.enum(values));

const FindingSchema = z.object({
  failure: lenient(FAILURE_CLASS_IDS, "SCENE_MISMATCH"),
  what: z.string().describe("Exactly what is wrong, in one sentence (which person/vehicle, what you see vs what's required)"),
});

export const PanelVerdictSchema = z.object({
  checks: z
    .array(z.object({ dimension: lenient(DIMENSIONS, "STYLE"), status: lenient(["pass", "minor", "fail", "n/a"], "minor"), note: z.string() }))
    .describe("One entry per relevant dimension"),
  failures: z.array(FindingSchema).describe("Every failure you are confident about; empty if the picture is correct"),
  confidence: lenient(["high", "medium", "low"], "medium").describe("How sure you are of this verdict overall"),
  fix: z.string().describe("If anything failed: precise instructions for the redraw (what to change, what must stay). Empty if nothing failed."),
});
export type PanelVerdict = z.infer<typeof PanelVerdictSchema>;

const QA_PROMPT = `You are the continuity editor of a comic studio. Every picture is part of a sequence: a beautiful picture with the wrong person, the wrong car, the wrong colour, broken physics or broken geography is a FAILED picture.

Compare the generated picture against the storyboard intent, the Continuity Ledger facts and the reference images. Be strict on hard failures, tolerant of harmless variation:
- Hard: wrong or replaced character; missing identity-critical markers (turban, glasses, beard…); wrong age; wrong person in a vehicle; a person twice; a canon vehicle/object with the wrong base colour, model, body kit or a missing/changed locked livery where it should be visible; duplicated vehicles; people clipping through vehicles or sitting outside them when they should be inside; impossible poses or anatomy; vehicles off the road or roads that can't exist; travel direction or who-is-ahead contradicting the ledger; the picture not showing the storyboard beat.
- Soft (note, don't fail): small background differences, lighting variation, unimportant passers-by, texture changes, tiny details you can't make out. Camera framing may vary if the same action and story beat remain clear. A wider view of the same action is NOT SCENE_MISMATCH; reserve that hard class for a different or missing narrative event. Simplified compositions intentionally change framing.
- Night lighting may darken a colour but must not change its hue: a white car can look blue-grey in shadow, never yellow, orange, green or black under even light.
- People in vehicles: a driver's chest and shoulders face the way the vehicle points, even when leaning out of a window (only the head may turn). Leaning out of a window means still seated with head, shoulder and forearm through the open side window; sitting on the sill, climbing out or rising above the roofline is IMPOSSIBLE_POSE unless the storyboard says they climb out. A torso facing the vehicle's rear, or a driver turned round facing the rear window, is IMPOSSIBLE_POSE; a driver on the wrong side of a vehicle with a locked driver side is DRIVER_SIDE_INCONSISTENCY. Work out which way the car points from its lights (headlights at the front, tail lights at the rear) before judging.
- Fixed scenery shared with the previous panel of the same scene (traffic lights, poles, kerbs, buildings) stays on the same side of the road. If the camera hasn't clearly moved to the other side and a traffic light or kerb swaps sides, that is ACTION_GEOGRAPHY_FAILURE.
- Only judge what is visible. Don't fail a livery that's on the side we can't see; do fail one that should be visible and isn't.
- Confidence is about your verdict on what is VISIBLE. If you examined everything visible and found nothing wrong, that is high confidence: never lower it because something is hidden, off-frame, stylised or small. Use medium when a required detail is genuinely ambiguous at this size, and low only when the image is too unclear to judge at all.
- Only report a failure you can point at. An extra person or prop the storyboard doesn't list is UNPLANNED_ELEMENT (soft) unless it is a named character who shouldn't be there twice or at all.

Failure classes:
${failureGuide()}`;

/** Downscaled JPEG for QA: enough to judge identity and geometry, cheap in tokens. */
export async function qaImage(data: Buffer, maxSide = 640): Promise<Buffer> {
  return sharp(data).resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 78 }).toBuffer();
}

export type QaReference = { label: string; data: Buffer };

/** Facts for one panel, as plain text the inspector can check against. */
export function panelFacts(panel: Panel, entry: LedgerEntry | undefined, objects: CanonObject[]): string {
  const lines = [
    `Storyboard beat: ${panel.scene}`,
    panel.context && `Where/when: ${[panel.context.location, panel.context.period, panel.context.timeOfDay, panel.context.weather].filter(Boolean).join(", ")}`,
    entry?.people.length
      ? `People (each exactly once): ${entry.people
          .map((p) => `${p.name}${p.stage ? ` [age stage: ${p.stage}]` : ""} wearing ${p.wardrobeFromSheet ? "their approved design-sheet outfit" : p.wardrobe}${p.inside ? `, inside ${p.inside.objectId} (${p.inside.position})${p.inferred ? " (may be hidden by glass/angle)" : ""}` : ""}`)
          .join("; ")}`
      : "People: none named",
    entry?.objects.length
      ? `Canon objects: ${entry.objects
          .map((o) => {
            const canon = objects.find((c) => c.id === o.id);
            return `${canon?.name ?? o.id}: ${canon?.description ?? ""} [locks: ${(canon?.locks ?? []).join("; ")}]${o.state ? ` state: ${o.state} (${canon?.states?.find(state => state.id === o.state)?.description ?? "as designed"})` : ""}${canon?.driverSide ? ` ${driverSideNote(canon.driverSide)}` : ""}`;
          })
          .join(" | ")}`
      : "",
    panel.context?.continuity && `Continuity: ${panel.context.continuity}`,
    entry?.motion && entry.motion.direction !== "static" && `Motion: travel ${entry.motion.direction}${entry.motion.order ? `; order: ${entry.motion.order}` : ""}${entry.motion.cameraSide ? `; camera: ${entry.motion.cameraSide}` : ""}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Inspects one generated picture. */
export async function checkPanel({
  image,
  facts,
  style,
  references,
  previous,
  effort = "low",
}: {
  image: Buffer;
  facts: string;
  style: ComicStyle;
  references: QaReference[];
  previous?: Buffer;
  effort?: "low" | "high";
}): Promise<PanelVerdict> {
  if (qaMockEnabled()) return { checks: [{ dimension: "SCENE_MATCH", status: "pass", note: "mock" }], failures: [], confidence: "high", fix: "" };
  const blocks = [
    { type: "text" as const, text: "Image 1: the GENERATED picture to check." },
    imageBlock(await qaImage(image, 768), "image/jpeg"),
    ...(
      await Promise.all(
        references.map(async (ref, i) => [
          { type: "text" as const, text: `Image ${i + 2}: reference: ${ref.label}.` },
          imageBlock(await qaImage(ref.data, 512), "image/jpeg"),
        ]),
      )
    ).flat(),
    ...(previous
      ? [{ type: "text" as const, text: `Image ${references.length + 2}: the PREVIOUS panel of this scene (for continuity: same vehicles, colours, clothes, direction).` }, imageBlock(await qaImage(previous, 512), "image/jpeg")]
      : []),
    { type: "text" as const, text: `Comic style: ${style.label}.\n\n${facts}\n\nCheck image 1.` },
  ];
  return askClaude({ system: QA_PROMPT, user: blocks, schema: PanelVerdictSchema, effort, operation: `visual-qa-${effort}`, maxTokens: 16000 });
}

export type Decision = "accept" | "retry" | "simplify" | "escalate" | "flag";

/** How many attempts a picture gets, by how risky the shot is. */
export function maxAttempts(complexity: Complexity): number {
  return complexity === "high" || complexity === "very_high" ? 3 : 2;
}

export function hardFailures(verdict: PanelVerdict): FailureClass[] {
  const failures = verdict.failures.map((f) => f.failure).filter(isHard);
  // A failed beat check is a hard failure even without a named class; other failed dimensions are soft.
  if (!failures.length && verdict.checks.some(check => check.status === "fail" && (check.dimension === "SCENE_MATCH" || check.dimension === "ACTION_MATCH"))) failures.push("SCENE_MISMATCH");
  return failures;
}

/**
 * Turns a verdict into an action. Correctness beats ambition: repeated hard failures switch to
 * the simpler safe shot before giving up, and nothing with a hard failure is silently accepted.
 * Anything less than high confidence gets one careful (high-effort) second look; after that a
 * clean picture is accepted unless the inspector still can't judge it at all (low), and concrete
 * hard failures are acted on. Soft findings never block.
 */
export function decide({ verdict, attempt, complexity, hasSafeShot, escalated }: { verdict: PanelVerdict; attempt: number; complexity: Complexity; hasSafeShot: boolean; escalated: boolean }): Decision {
  const hard = hardFailures(verdict);
  if (verdict.confidence !== "high" && !escalated) return "escalate";
  if (hard.length === 0) return verdict.confidence === "low" ? "flag" : "accept";
  if (verdict.confidence === "low") return "flag";
  const limit = maxAttempts(complexity);
  if (attempt >= limit) return "flag";
  // The last attempt (or the second, for risky shots that already failed once) uses the safe shot.
  if (hasSafeShot && (attempt === limit - 1 || complexity === "very_high")) return "simplify";
  return "retry";
}

// --- Page and whole-comic passes ------------------------------------------------------------------

export const SequenceSchema = z.object({
  findings: z
    .array(z.object({ key: z.string().describe('Picture key, e.g. "3-2" or "cover"'), failure: lenient(FAILURE_CLASS_IDS, "SCENE_MISMATCH"), what: z.string(), fix: z.string() }))
    .describe("Problems you are confident about, each tied to the picture that should be redrawn"),
  notes: z.string().describe("One line summary"),
  confidence: lenient(["high", "medium", "low"], "medium"),
});
export type SequenceVerdict = z.infer<typeof SequenceSchema>;

const SEQUENCE_PROMPT = `${QA_PROMPT}

You are now checking a whole page (or the whole comic) at once, which exposes problems single pictures hide: the same character or vehicle drifting between panels (colour, livery, model, face, clothes mid-scene), duplicate people, contradictory geography or direction between consecutive panels (including a traffic light, pole or kerb swapping sides of the road within one scene), anyone teleporting, objects appearing or vanishing, sudden proportion changes, and (on lettered pages) balloons far from their speaker, covering faces, or text cut off. Tie every finding to the single picture that should be redrawn (the one that's inconsistent with the canon sheets and the majority). A hard class means that picture must be redrawn: use one only for a concrete problem you can point at. Anything minor, optional or already acceptable uses a soft class or no finding at all.`;

/**
 * The findings that block a page or the whole book: concrete hard failures on pictures in it.
 * Same rule as `decide` after its careful second look: every picture already passed its own
 * check, so lower confidence and soft findings never block, and findings on unknown keys are ignored.
 */
export function sequenceBlockers(verdict: SequenceVerdict, keys: string[]): SequenceVerdict["findings"] {
  return verdict.findings.filter((f) => keys.includes(f.key) && isHard(f.failure));
}

/** Checks a lettered page (as rendered for the reader) for cross-panel continuity and lettering problems. */
export async function checkSequence({
  pageImage,
  label,
  facts,
  style,
  references,
  effort = "low",
}: {
  pageImage: Buffer;
  label: string;
  facts: string;
  style: ComicStyle;
  references: QaReference[];
  effort?: "low" | "high";
}): Promise<SequenceVerdict> {
  if (qaMockEnabled()) return { findings: [], notes: "mock", confidence: "high" };
  const blocks = [
    { type: "text" as const, text: `Image 1: ${label}.` },
    imageBlock(await qaImage(pageImage, 1400), "image/jpeg"),
    ...(
      await Promise.all(
        references.map(async (ref, i) => [{ type: "text" as const, text: `Image ${i + 2}: reference: ${ref.label}.` }, imageBlock(await qaImage(ref.data, 512), "image/jpeg")]),
      )
    ).flat(),
    { type: "text" as const, text: `Comic style: ${style.label}.\n\n${facts}` },
  ];
  return askClaude({ system: SEQUENCE_PROMPT, user: blocks, schema: SequenceSchema, effort, operation: `sequence-qa-${effort}`, maxTokens: 16000 });
}

/** A labelled contact sheet of pictures (for the whole-comic pass): one image instead of forty. */
export async function contactSheet(pictures: { key: string; data: Buffer }[], cell = 300, columns = 8): Promise<Buffer> {
  const rows = Math.ceil(pictures.length / columns);
  const tiles = await Promise.all(
    pictures.map(async (picture, i) => {
      const thumb = await sharp(picture.data).resize(cell, cell, { fit: "contain", background: "#ffffff" }).toBuffer();
      const label = Buffer.from(`<svg width="${cell}" height="34"><rect width="70" height="34" fill="#000"/><text x="8" y="25" font-family="sans-serif" font-size="22" fill="#fff">${picture.key}</text></svg>`);
      const tile = await sharp(thumb).composite([{ input: label, top: 0, left: 0 }]).png().toBuffer();
      return { input: tile, left: (i % columns) * cell, top: Math.floor(i / columns) * cell };
    }),
  );
  return sharp({ create: { width: columns * cell, height: rows * cell, channels: 3, background: "#ffffff" } }).composite(tiles).jpeg({ quality: 80 }).toBuffer();
}

/** Ledger facts for many panels, compactly, for page and whole-comic passes. */
export function sequenceFacts(script: ComicScript, entries: LedgerEntry[], objects: CanonObject[], keys: string[]): string {
  return keys
    .map((key) => {
      const entry = entries.find((e) => e.key === key);
      const [p, i] = key.split("-").map((n) => Number(n) - 1);
      const panel = script.pages[p]?.panels[i];
      if (!panel) return null;
      return `[${key}] ${panelFacts(panel, entry, objects).replace(/\n/g, " | ")}`;
    })
    .filter(Boolean)
    .join("\n");
}

export const HARD_FAILURE_COUNT = (verdict: PanelVerdict) => hardFailures(verdict).length;
export { FAILURE_CLASSES };

export function qaMockEnabled(): boolean {
  return process.env.COMICME_FAKE_QA === "1" && process.env.COMICME_FAKE_IMAGES === "1" && !!process.env.COMICME_STORAGE_DIR && process.env.NODE_ENV !== "production";
}
