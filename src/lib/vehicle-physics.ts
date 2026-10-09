// Panel physics for vehicles: the explicit scene state every vehicle picture must obey, derived
// from the storyboard and the Continuity Ledger with no AI calls. The same state goes into the art
// prompt (as hard rules), the visual-QA facts (so the inspector checks it) and the storyboard lint
// (so contradictions are caught before anything is drawn).
//
// Learned from "Corners Are for Winning": drivers leaning out of racing cars, drivers turned round
// facing the rear window, cars pointing opposite ways, scenery swapping sides. Image models resolve
// a vague prompt with their priors; every one of these is stated explicitly here instead.
//
// Type-only imports keep this module pure, so `node --test` can run it directly.

import type { CanonObject, Motion, Panel } from "./comic";
import type { LedgerEntry, LedgerPerson } from "./continuity";

export type Speed = "parked" | "stopped" | "crawling" | "moving" | "fast" | "drifting";
const MOVING: Speed[] = ["moving", "fast", "drifting"];

const PARKED = /\b(parked|cooling|unattended|abandoned)\b/;
const DRIFT = /\b(drift|drifts|drifting|(fully|snaps?|goes|swings?|kicks?|slides?|sliding) sideways|sideways (through|across|into)|opposite[- ]lock|spins|spinning|spins out|skids?|skidding)\b/;
const FAST = /\b(race|races|racing|launch|launches|launching|speeds?|speeding|chase|chasing|overtakes?|overtaking|flat out|full throttle|blasts?|rockets?|surg(es|ing)|swerves?|zig-?zags?|weav(es|ing)|dives? for|brakes? late|runs? wide|tail lights in front|glued to|floors it|foot down|slamm(ing|s) the floor|foot slamming)\b/;
const STOPPED = /\b(idles?|idling|stopped|stop line|at the signal|(at|under) (a|the) red (light|signal)|(light|signal) (is |still |glows |turns )?red|waits|waiting|stalled|screeched up|standing still|perfectly still|stand-?off)\b/;
const SLOW = /\b(rolls? (in|up|into|out)|rolling|crawl(s|ing)?|noses? out|pulls? (up|in|out)|creeps?|inching)\b/;
/** Poses that need the car (nearly) still: a body out of the window, waving, looking at the camera. */
const OUTSIDE_POSE = /\b(lean(s|ing)? out|hang(s|ing)? out|out of the (driver'?s? |passenger'?s? )?window|stick(s|ing)? (his|her|their) head out|wav(es|ing)|wave back|looks? (back )?at the camera|toward the camera)\b/;

const lower = (text: string | undefined) => (text ?? "").toLowerCase();

/** How fast the vehicles in this panel are going, from the director's motion or the words of the scene. */
export function vehicleSpeed(panel: Panel, entry: LedgerEntry | undefined): Speed {
  const motion = entry?.motion ?? panel.context?.motion;
  // The panel's own words win over the scene's general activity ("idles at the light" during a race).
  for (const text of [lower(panel.scene), lower(`${panel.context?.activity ?? ""} ${panel.context?.event ?? ""}`)]) {
    if (PARKED.test(text)) return "parked";
    if (DRIFT.test(text)) return "drifting";
    if (STOPPED.test(text)) return "stopped";
    if (FAST.test(text)) return "fast";
    if (SLOW.test(text)) return "crawling";
    if (text === lower(panel.scene) && motion?.direction === "static") return "stopped";
  }
  if (/garage/.test(lower(panel.context?.location))) return "parked";
  return motion?.direction === "static" ? "stopped" : "moving";
}

const HEADING: Record<Exclude<Motion["direction"], "static">, { words: string; behind: string }> = {
  "left-to-right": { words: "pointing screen-RIGHT (noses to the right of frame)", behind: "toward screen-left" },
  "right-to-left": { words: "pointing screen-LEFT (noses to the left of frame)", behind: "toward screen-right" },
  "toward-camera": { words: "pointing TOWARD the camera (we see their fronts)", behind: "away from the camera, behind the car" },
  "away-from-camera": { words: "pointing AWAY from the camera (we see their rears)", behind: "toward the camera" },
};

/**
 * Where the vehicles point on screen: the panel's own travel direction, else the one established
 * earlier in its action sequence (stopped cars keep pointing the way they were going).
 */
export function vehicleHeading(entry: LedgerEntry | undefined, entries: LedgerEntry[] = []): Exclude<Motion["direction"], "static"> | undefined {
  if (!entry) return undefined;
  if (entry.motion && entry.motion.direction !== "static") return entry.motion.direction;
  if (!entry.sequence) return undefined;
  const earlier = entries.slice(0, entries.findIndex((candidate) => candidate.key === entry.key)).reverse();
  const established = earlier.find((candidate) => candidate.sequence === entry.sequence && candidate.motion && candidate.motion.direction !== "static");
  return established?.motion?.direction as Exclude<Motion["direction"], "static"> | undefined;
}

export type PhysicsConflict = { person: string; pose: string; speed: Speed };

/** The contradiction check: poses that are impossible at this panel's speed. */
export function physicsConflicts(panel: Panel, entry: LedgerEntry | undefined): PhysicsConflict[] {
  const speed = vehicleSpeed(panel, entry);
  if (!MOVING.includes(speed)) return [];
  const conflicts: PhysicsConflict[] = [];
  // A sentence of the scene belongs to the people it names; the person's own action is the most specific source.
  const sentences = lower(panel.scene).split(/(?<=[.;!?])\s+/);
  for (const person of entry?.people ?? []) {
    if (!person.inside) continue;
    const raw = panel.context?.cast.find((candidate) => lower(candidate.name) === lower(person.name));
    const names = [lower(person.name), ...lower(person.name).split(/\s+/).filter((word) => word.length > 3)];
    const own = lower(raw?.action).match(OUTSIDE_POSE)?.[0];
    const scene = sentences.find((sentence) => names.some((name) => sentence.includes(name)) && OUTSIDE_POSE.test(sentence))?.match(OUTSIDE_POSE)?.[0];
    const pose = own ?? scene;
    if (pose) conflicts.push({ person: person.name, pose, speed });
  }
  return conflicts;
}

const isDriver = (person: LedgerPerson) => !!person.inside && /driv|wheel/i.test(person.inside.position);

/** Body, head, eyes and hands for one person in a vehicle: all four, always. */
function occupantPose(person: LedgerPerson, speed: Speed, conflicted: boolean): string {
  const driver = isDriver(person);
  const moving = MOVING.includes(speed);
  if (moving) {
    return driver
      ? `${person.name} (driving, ${speed}): body and shoulders face the direction of travel; torso fully inside the cabin; head faces forward (a glance back only via the mirror or over the shoulder with the body still forward); eyes on the road; ${speed === "drifting" ? "both hands working the wheel in counter-steer" : "both hands on the wheel"}.${conflicted ? " The storyboard has them lean out or look at the camera, which is impossible at this speed: show the same attitude from inside the cabin instead (a grin, a raised eyebrow, a glance in the mirror)." : ""}`
      : `${person.name} (passenger, ${speed}): seated, body facing the direction of travel, torso inside the cabin, eyes forward or on the action.`;
  }
  if (speed === "parked") return `${person.name}: seated naturally, or getting in or out as the scene describes; body facing the car's front when seated.`;
  return driver
    ? `${person.name} (driving, ${speed}): seated, body facing forward; at most head, shoulder and forearm through the open side window (never sitting on the sill, never above the roofline); head may turn toward the window or another car; eyes on whoever they are reacting to; at least one hand on the wheel.`
    : `${person.name} (passenger, ${speed}): seated, body facing forward; head may turn; hands inside the cabin.`;
}

/**
 * The full physics declaration for a vehicle panel: scene state, occupants' poses, camera and
 * action line, scale anchors and the negative list. False when no vehicle is in frame.
 */
export function physicsNotes(panel: Panel, entry: LedgerEntry | undefined, entries: LedgerEntry[], objects: Pick<CanonObject, "id" | "name" | "kind" | "driverSide">[]): string | false {
  const vehicles = (entry?.objects ?? []).map((item) => objects.find((object) => object.id === item.id)).filter((object): object is NonNullable<typeof object> => object?.kind === "vehicle");
  if (!vehicles.length) return false;
  const speed = vehicleSpeed(panel, entry);
  const heading = vehicleHeading(entry, entries);
  const conflicts = physicsConflicts(panel, entry);
  const occupants = (entry?.people ?? []).filter((person) => person.inside);
  const moving = MOVING.includes(speed);
  const drive = [...new Set(vehicles.map((vehicle) => vehicle.driverSide))].filter(Boolean);
  const lines = [
    "SCENE STATE (physical facts this picture must obey):",
    `- Vehicles: ${vehicles.map((vehicle) => vehicle.name).join(", ")}; ${heading ? `${HEADING[heading].words}` : "pointing the way the scene and the previous panel establish"}; ${speed}${speed === "stopped" ? " (wheels still)" : ""}; ${drive.length ? `${drive.map((side) => (side === "right" ? "right-hand drive (steering wheel on the car's own right)" : "left-hand drive (steering wheel on the car's own left)")).join(", ")}, the same for the whole book` : "one steering wheel each"}.`,
    ...occupants.map((person) => `- ${occupantPose(person, speed, conflicts.some((conflict) => conflict.person === person.name))}`),
    `- Camera: ${panel.context?.camera || panel.shot}${entry?.motion?.cameraSide ? `; on the ${entry.motion.cameraSide} side of the action line` : "; on the same side of the action line as the previous panel of this scene"}. Don't cross the line unless the scene says so.`,
    moving
      ? `- Tyre smoke, exhaust flames, speed lines and motion blur trail BEHIND the vehicles${heading ? ` (${HEADING[heading].behind})` : ""}, opposite to the direction of travel.`
      : "- No speed lines, motion blur or trailing tyre smoke: the vehicles are not travelling. An exhaust flame, if any, is a short pop at the tailpipe.",
    occupants.length > 0 &&
      "- Scale: a seated driver's head sits below the roofline and their shoulders fit inside the window opening; a head is about a quarter of the door's height; a standing adult is about 1.3 to 1.5 times the car's height (low sports cars are about 1.2 m tall).",
    `- Never: ${[
      moving && "a body outside a window while moving",
      moving && "a driver turned backward while moving",
      moving && "hands off the wheel at speed",
      "a driver facing the rear of the car or looking out of the rear window",
      "oversized or undersized people next to the car",
      "two steering wheels, or a steering wheel on the wrong side",
      "a door mirror on the wrong side or missing",
      "vehicles pointing different ways unless the scene says so",
    ].filter(Boolean).join("; ")}.`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** One line for the inspector: the state to check the picture against. */
export function physicsFacts(panel: Panel, entry: LedgerEntry | undefined, entries: LedgerEntry[]): string | false {
  if (!entry?.objects.length) return false;
  const speed = vehicleSpeed(panel, entry);
  const heading = vehicleHeading(entry, entries);
  const conflicts = physicsConflicts(panel, entry);
  return `Physics state: vehicles ${heading ? HEADING[heading].words : "pointing as established"}, ${speed}. ${MOVING.includes(speed) ? "Moving: every driver faces the direction of travel with both hands on the wheel and torso inside; smoke/flames/blur trail behind." : "Not travelling: a driver may turn their head or put head, shoulder and forearm out of the open window, seated."}${conflicts.length ? ` The storyboard asks for ${conflicts.map((conflict) => `${conflict.person} "${conflict.pose}"`).join(", ")} at speed: that pose is replaced, and the attitude is shown from inside the cabin. Don't fail the beat for the missing pose; a body outside the window here is IMPOSSIBLE_POSE.` : ""}`;
}
