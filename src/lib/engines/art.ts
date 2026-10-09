import "server-only";
import { createReadStream } from "node:fs";
import OpenAI, { toFile } from "openai";
import { identityOnly, type CanonObject, type ComicScript, type CoverDesign, type Importance, type Motion, type SceneContext } from "../comic";
import type { LedgerEntry, LedgerObject, LedgerPerson } from "../continuity";
import { mentionsCharacter } from "../cast-matching";
import { imageCost, imageTokenCost } from "../costs";
import { requireEnv, UserFacingError } from "../errors";
import { recordUsage } from "../meter";
import { COVER_SIZE, describeShape, frameNote, imageSizeForAspect, LAYOUTS, panelAspect } from "../layouts";
import type { ComicStyle } from "../styles";
import { familyGuidance } from "./cover";

// Art Engine: draws the cover, each panel and character designs (no text — our renderer
// letters on top). Approved character designs are passed in as reference images so every
// panel keeps the same faces and outfits. Kept to plain functions so OpenAI can later be
// swapped for FLUX / fal.ai.

const QUALITIES = ["low", "medium", "high"] as const;
type Quality = (typeof QUALITIES)[number];
/** Most reference images we send with one picture: canon object sheets, character designs and the previous panel. */
const MAX_REFERENCES = 16;

export const IMAGE_MODEL = () => process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.5-flare";

export function imageQuality(): Quality {
  const value = process.env.OPENAI_IMAGE_QUALITY?.trim() as Quality;
  return QUALITIES.includes(value) ? value : "medium";
}

/** Hero panels (the book's 1-2 jaw-droppers) are drawn at higher quality and resolution. */
export function heroQuality(): Quality {
  const value = process.env.HERO_IMAGE_QUALITY?.trim() as Quality;
  return QUALITIES.includes(value) ? value : "high";
}
/** Hero panels get about 1.6 megapixels instead of 1. */
export const HERO_PIXELS = 1.6 * 1024 * 1024;

const NO_TEXT =
  "IMPORTANT: Do not draw any text, letters, words, numbers, captions, speech balloons, sound-effect lettering, logos, signatures or watermarks anywhere in the image. No panel borders or multiple panels: one single continuous illustration.";

/** A character with an approved design, available as a reference picture (per life stage too). */
export type CastRef = {
  name: string;
  description: string;
  designPath: string;
  importance?: Importance;
  stages?: { id: string; label: string; look: string; designPath?: string }[];
};

/** An Object Bible entry with its approved canon sheet (if any), for prompts and references. */
/** "Right" alone is ambiguous (viewer's or car's right?), so spell it out from each viewpoint. */
export function driverSideNote(side: "left" | "right"): string {
  const other = side === "right" ? "left" : "right";
  return `${side === "right" ? "Right" : "Left"}-hand drive: the steering wheel and the driver are on the car's OWN ${side} side. Seen from behind the car the driver is on the ${side} of the cabin; seen from the front, on the ${other}. Never mirror this.`;
}
export type ObjectRef = Pick<CanonObject, "id" | "name" | "kind" | "role" | "owner" | "description" | "locks" | "driverSide" | "states"> & { designPath?: string };

export type ArtJob = {
  prompt: string;
  size: string;
  references: string[];
  /** Overrides the default quality (hero panels). */
  quality?: Quality;
  /** For logs and test placeholders. */
  label?: string;
};

/** Redrawing one picture: the current version plus what the user wants changed. */
export type Revision = { currentPath: string; feedback: string };

/** Visual-QA feedback for an automatic retry, and whether to fall back to the panel's safe shot. */
export type QaRetry = { fix: string; safe: boolean };

function revisionNotes(revision: Revision | undefined): string | false {
  return (
    !!revision &&
    `This is a redraw. Reference image 1 is the current version of this picture. Redraw it with this change requested by the reader (the most important instruction; apply it clearly): ${revision.feedback.trim() || "a better, more striking version of the same moment"}. Keep everything the change doesn't affect: the same moment, characters, setting, colours and art style.`
  );
}

const sameName = (a: string, b: string) => a.normalize("NFKC").toLowerCase().trim() === b.normalize("NFKC").toLowerCase().trim();

/** Reference pictures for one image, numbered in the order they're sent. */
class References {
  readonly paths: string[] = [];
  constructor(private readonly limit = MAX_REFERENCES) {}
  add(path: string | undefined): number | null {
    if (!path || this.paths.length >= this.limit) return null;
    const existing = this.paths.indexOf(path);
    if (existing >= 0) return existing + 1;
    this.paths.push(path);
    return this.paths.length;
  }
}

/** Canon objects in frame: their sheets as references and their LOCKED attributes as hard rules. */
function objectNotes(entries: LedgerObject[], objectRefs: ObjectRef[], refs: References): string | false {
  const lines = entries.map((entry) => {
    const object = objectRefs.find((candidate) => candidate.id === entry.id);
    if (!object) return null;
    const n = refs.add(object.designPath);
    const state = entry.state ? object.states?.find((candidate) => candidate.id === entry.state || candidate.label === entry.state) : undefined;
    return [
      `- ${object.name}${n ? `: reference image ${n} is its canon model sheet; draw it EXACTLY like the sheet` : `: ${object.description}`}.`,
      object.locks.length > 0 && `  LOCKED, must be correct even if small or far away: ${object.locks.join("; ")}.`,
      state ? `  State in this panel: ${state.label}: ${state.description}.` : "  State: exactly as designed (no damage, no changed decals).",
      entry.position && `  Position: ${entry.position}.`,
      object.kind === "vehicle" && object.driverSide && `  ${driverSideNote(object.driverSide)}`,
    ]
      .filter(Boolean)
      .join("\n");
  });
  const present = lines.filter(Boolean);
  return present.length > 0 && `Canon objects (Object Bible: these must match their sheets exactly; never change their colour or design):\n${present.join("\n")}`;
}

/** People in frame from the ledger: design sheet for the right age, the outfit rule, and where they physically are. */
function peopleNotes(script: ComicScript, context: SceneContext | undefined, people: LedgerPerson[], castRefs: CastRef[], objectRefs: ObjectRef[], refs: References): string | false {
  const priority = { main: 0, supporting: 1, minor: 2 };
  const sorted = [...people].sort((a, b) => {
    const ra = castRefs.find((ref) => sameName(ref.name, a.name));
    const rb = castRefs.find((ref) => sameName(ref.name, b.name));
    return priority[ra?.importance ?? "minor"] - priority[rb?.importance ?? "minor"];
  });
  const lines = sorted.map((person) => {
    const ref = castRefs.find((candidate) => sameName(candidate.name, person.name));
    const stage = person.stage ? ref?.stages?.find((candidate) => candidate.id === person.stage) : undefined;
    const raw = context?.cast.find((candidate) => sameName(candidate.name, person.name));
    const who = `${person.name}${stage ? ` (${stage.label})` : ""}`;
    const n = refs.add(stage ? stage.designPath : ref?.designPath);
    const outfit = person.wardrobeFromSheet
      ? `Outfit: copy it from their design sheet (their approved look for this age).`
      : `In this panel they wear: ${person.wardrobe}${n ? " (NOT the outfit on the design sheet)" : ""}.`;
    const vehicle = person.inside ? objectRefs.find((object) => object.id === person.inside!.objectId) : undefined;
    const placement =
      person.inside &&
      `${person.name} is INSIDE ${vehicle?.name ?? "the vehicle"} (${person.inside.position || "seated"}): head and torso inside the cabin behind the window glass, never through the door, roof or glass; ${/driv|wheel/i.test(person.inside.position) ? "hands on the steering wheel, facing the direction of travel. Even if the scene has them lean out of the window, their chest and shoulders face the way the car's nose points; only the head turns. Never sit them backwards, facing the car's rear" : "seated naturally"}.${person.inferred ? " Only visible if the camera can see into the cabin; if visible, it is unmistakably them." : ""}`;
    const doing = `Feeling: ${raw?.emotion || "as the scene suggests"}. Doing: ${raw?.action || "as described"}.`;
    if (n) {
      return [`- ${who}: reference image ${n} is their character design${stage ? " at this age" : ""}. Copy who they are exactly (face, features, skin tone, hair, build, distinctive markers such as a turban, glasses or beard). ${outfit} ${doing}`, placement && `  ${placement}`]
        .filter(Boolean)
        .join("\n");
    }
    const character = script.characters.find((candidate) => sameName(candidate.name, person.name));
    const look = identityOnly(stage?.look ?? ref?.description ?? character?.appearance ?? "");
    return [`- ${who}: ${look} ${outfit} ${doing}`, placement && `  ${placement}`].filter(Boolean).join("\n");
  });
  return lines.length > 0 && `Characters (each appears exactly once; nobody else may look like them):\n${lines.join("\n")}`;
}

function motionNotes(motion: Motion | undefined, hasVehicles: boolean): string | false {
  if (!motion || motion.direction === "static") return false;
  const direction = {
    "left-to-right": "everything travels from LEFT to RIGHT across the frame (vehicles point right)",
    "right-to-left": "everything travels from RIGHT to LEFT across the frame (vehicles point left)",
    "toward-camera": "everything travels TOWARD the camera (we see the fronts)",
    "away-from-camera": "everything travels AWAY from the camera (we see the rears)",
  }[motion.direction];
  return [
    `Screen direction: ${direction}.${hasVehicles ? " All moving vehicles in this sequence face the same way unless the scene says otherwise." : ""}`,
    motion.order && `Positions: ${motion.order}. This order must be clearly readable.`,
    motion.cameraSide && `Camera side: ${motion.cameraSide}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function settingNotes(context: SceneContext): string {
  return [
    context.location && `Location: ${context.location}.`,
    [context.period, context.timeOfDay, context.weather].filter(Boolean).length > 0 &&
      `When: ${[context.period, context.timeOfDay, context.weather].filter(Boolean).join(", ")}.`,
    context.event && `Occasion: ${context.event}.`,
    context.activity && `What's happening: ${context.activity}.`,
    context.relationships && `Between them: ${context.relationships}.`,
    context.camera && `Camera: ${context.camera}.`,
    context.objects.length > 0 && `Props: ${context.objects.join(", ")}.`,
    context.continuity && `Continuity with the previous panel: ${context.continuity}`,
  ]
    .filter(Boolean)
    .join(" ");
}

function retryNotes(retry: QaRetry | undefined): string | false {
  return (
    !!retry &&
    `IMPORTANT: a previous attempt at this picture failed our continuity check. Fix exactly this: ${retry.fix}${retry.safe ? " Use the simpler composition below: correct storytelling matters more than drama." : ""}`
  );
}

/** Objects worth putting on the cover: anything the brief mentions, plus the hero's own. */
export function coverObjects(scene: string, objectRefs: ObjectRef[]): LedgerObject[] {
  const text = scene.toLowerCase();
  return objectRefs
    .filter((object) => object.role === "hero" || object.name.toLowerCase().split(/[^a-z0-9-]+/).some((word) => word.length > 2 && text.includes(word)))
    .map((object) => ({ id: object.id, name: object.name }));
}

/** Where the calm space for the title must be, in words the artist understands. */
function titleSpace(design: CoverDesign | undefined): string {
  const position = design?.titlePosition ?? "top";
  const align = design?.titleAlign ?? "center";
  const size = design?.titleSize ?? "huge";
  const band = { top: "top", middle: "middle band", bottom: "bottom" }[position];
  const side = align === "center" ? "" : ` ${align}`;
  const amount = size === "huge" || size === "large" ? "a generous area" : "a small, quiet area";
  return `Keep ${amount} at the ${band}${side} of the image calm and simple (flat colour, sky, shadow or paper) for the title, which our designers letter on top later.`;
}

export function coverJob(
  script: ComicScript,
  style: ComicStyle,
  castRefs: CastRef[] = [],
  revision?: Revision,
  objectRefs: ObjectRef[] = [],
  retry?: QaRetry,
  entry?: LedgerEntry,
): ArtJob {
  const scene = script.cover?.scene ?? script.pages[0].panels[0].scene;
  const design = script.cover?.design;
  const refs = new References();
  if (revision) refs.add(revision.currentPath);
  const objects = objectNotes(coverObjects(scene, objectRefs), objectRefs, refs);
  const names = [...script.characters.map((c) => c.name), ...castRefs.map((c) => c.name)];
  const people: LedgerPerson[] = entry?.people ?? castRefs
    .filter((ref) => mentionsCharacter(scene, ref.name, names))
    .map((ref) => ({ name: ref.name, stage: "", wardrobe: "clothes that fit the cover concept", wardrobeFromSheet: false }));
  const cast = peopleNotes(script, undefined, people, castRefs, objectRefs, refs);
  const prompt = [
    revisionNotes(revision),
    retryNotes(retry),
    "The front cover of a premium comic book, portrait format, by a world-class cover artist and designer: an authored, art-directed image where illustration and graphic design work together.",
    `Art style: ${style.art}`,
    design && `Cover concept: ${design.concept}`,
    `Composition family: ${familyGuidance(design?.approach)}. Commit to it fully; don't fall back to a centred character posing in front of a background.`,
    `Cover brief: ${scene}`,
    retry?.safe && "Simpler composition: one clear focal subject, neutral eye-level perspective, unobscured silhouettes and no extreme perspective; keep the same story and canon.",
    objects,
    objects && "The cover palette applies to the background and lighting, NEVER to the canon objects' own colours.",
    cast,
    "Craft: one clear idea readable at thumbnail size; a strong silhouette; deliberate negative space; a limited palette with one accent colour; finished, confident rendering where it matters and restraint everywhere else.",
    titleSpace(design),
    NO_TEXT,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { prompt, size: COVER_SIZE, references: refs.paths, label: "cover" };
}

/**
 * One panel, built from the Continuity Ledger: canon objects with their sheets and locks, people
 * with their age-correct designs, outfit rules and physical placement, screen direction, and the
 * previous panel of the same scene as a continuity reference. With `retry`, it carries visual QA's
 * fix (and, after repeated failures, switches to the panel's simpler safe shot).
 */
export function panelJob(
  script: ComicScript,
  pageIndex: number,
  panelIndex: number,
  style: ComicStyle,
  castRefs: CastRef[] = [],
  revision?: Revision,
  options: { objectRefs?: ObjectRef[]; entry?: LedgerEntry; previousPanelPath?: string; retry?: QaRetry } = {},
): ArtJob {
  const { objectRefs = [], entry, previousPanelPath, retry } = options;
  const page = script.pages[pageIndex];
  const panel = page.panels[panelIndex];
  const rect = LAYOUTS[page.layout].panels[panelIndex];
  const aspect = panelAspect(rect);
  const refs = new References();
  if (revision) refs.add(revision.currentPath);

  const objects = entry ? objectNotes(entry.objects, objectRefs, refs) : false;
  const people = entry && panel.context
    ? peopleNotes(script, panel.context, entry.people, castRefs, objectRefs, refs)
    : legacyCast(script, `${panel.scene} ${panel.dialogue.map((line) => line.speaker).join(" ")}`, castRefs, refs);
  const previousN = previousPanelPath && !revision ? refs.add(previousPanelPath) : null;
  const hasVehicles = !!entry?.objects.some((object) => objectRefs.find((ref) => ref.id === object.id)?.kind === "vehicle");

  const placements = [...new Map(panel.dialogue.map((line) => [line.speaker, line.side])).entries()].map(
    ([speaker, side]) => `${speaker} is on the ${side} side of the frame.`,
  );
  const hasLettering = panel.caption.trim() !== "" || panel.dialogue.length > 0;

  // Neighbouring panels, so each picture (and every redraw) flows with the story around it.
  const flat = script.pages.flatMap((pg) => pg.panels);
  const at = script.pages.slice(0, pageIndex).reduce((sum, pg) => sum + pg.panels.length, 0) + panelIndex;
  const neighbours = [
    flat[at - 1] && `Previous panel showed: ${flat[at - 1].scene.slice(0, 240)}`,
    flat[at + 1] && `Next panel will show: ${flat[at + 1].scene.slice(0, 240)}`,
  ].filter(Boolean);

  const safe = !!retry?.safe && !!panel.safeShot;
  const hero =
    panel.hero &&
    !safe &&
    `HERO PANEL: this is one of the one or two moments in the whole book that readers will remember${panel.heroReason ? ` (${panel.heroReason})` : ""}. Make it a jaw-dropping, authored image, not a routine panel: ${style.direction.hero} Push the camera further than any other panel, give it a bold foreground shape and a clear focal point, and render the environment and light with splash-page ambition. Ambition never overrides correctness: identities, canon objects, direction and physics must still be exactly right.`;
  const prompt = [
    revisionNotes(revision),
    retryNotes(retry),
    `A single comic book panel illustration: ${describeShape(aspect)}.`,
    frameNote(rect),
    `Art style: ${style.art}`,
    hero,
    `Shot: ${safe ? "clear, readable framing" : panel.shot}.`,
    safe ? `Scene (simplified for clarity): ${panel.safeShot}` : `Scene: ${panel.scene}`,
    panel.context && settingNotes(safe ? { ...panel.context, camera: "" } : panel.context),
    objects,
    people,
    motionNotes(entry?.motion, hasVehicles),
    hasVehicles &&
      "Physics: vehicles sit on the road with all wheels on the ground (unless the scene says otherwise), roads, lanes and junctions are physically plausible, and the only vehicles are the ones named here plus clearly secondary background traffic. No duplicate of any named vehicle or person.",
    previousN && `Reference image ${previousN} is the previous panel of this same scene: keep the setting, lighting, colours, vehicles and everyone's clothes consistent with it, but draw the NEW moment and camera described here (don't copy its composition).`,
    placements.length > 0 && `Composition: ${placements.join(" ")}`,
    neighbours.length > 0 && `Story flow (for continuity only, don't draw these): ${neighbours.join(" ")}`,
    hasLettering &&
      "Leave room for lettering: keep the top third of the image as calm, simple background (sky, wall, ceiling). Frame the characters so their heads and faces sit below the top third, never at the very top of the frame.",
    NO_TEXT,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    prompt,
    size: panel.hero && !safe ? imageSizeForAspect(aspect, HERO_PIXELS) : imageSizeForAspect(aspect),
    references: refs.paths,
    quality: panel.hero && !safe ? heroQuality() : undefined,
    label: `panel ${pageIndex + 1}-${panelIndex + 1}${panel.hero ? " ★" : ""}${retry ? " (retry)" : ""}`,
  };
}

/** Panels written before scene context existed: characters found by name in the text. */
function legacyCast(script: ComicScript, text: string, castRefs: CastRef[], refs: References): string | false {
  const names = [...script.characters.map((c) => c.name), ...castRefs.map((c) => c.name)];
  const priority = { main: 0, supporting: 1, minor: 2 };
  const designed = castRefs
    .filter((ref) => mentionsCharacter(text, ref.name, names))
    .sort((a, b) => priority[a.importance ?? "supporting"] - priority[b.importance ?? "supporting"]);
  const others = script.characters.filter((character) => mentionsCharacter(text, character.name, names) && !designed.some((ref) => ref.name === character.name));
  const lines = [
    ...designed.map((ref) => {
      const n = refs.add(ref.designPath);
      return n ? `- ${ref.name}: reference image ${n} is their character design. Draw them exactly like it (face, hair, build, distinctive features). ${ref.description}` : `- ${ref.name}: ${ref.description}`;
    }),
    ...others.map((character) => `- ${character.name}: ${character.appearance}`),
  ];
  return lines.length > 0 && `Characters (keep their appearance exactly as described):\n${lines.join("\n")}`;
}

/** OpenAI client for images: gives up on a hung request after 5 minutes instead of waiting indefinitely. */
export function imageClient(): OpenAI {
  return new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY"), maxRetries: 1, timeout: 5 * 60 * 1000 });
}

/** A saved picture as an upload for OpenAI, with its file type (OpenAI rejects files without one). */
export function referenceFile(path: string, index: number) {
  const extension = path.split(".").pop() === "jpg" ? "jpg" : "webp";
  const type = extension === "jpg" ? "image/jpeg" : "image/webp";
  return toFile(createReadStream(path), `reference-${index + 1}.${extension}`, { type });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * New OpenAI accounts may only draw a few images per minute. When we hit that limit,
 * wait as long as OpenAI asks ("try again in 12s") and try again, instead of failing.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>, onRetry?: () => void): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      if (attempt > 1) onRetry?.();
      return await fn();
    } catch (error) {
      if (!(error instanceof OpenAI.RateLimitError) || attempt >= 8 || /quota|billing/i.test(error.message)) throw error;
      const seconds = Number(/try again in ([\d.]+)s/i.exec(error.message)?.[1] ?? 15);
      await sleep((seconds + 1 + Math.random() * 4) * 1000);
    }
  }
}

/** Logs one image call for the cost meter, priced from the tokens OpenAI reports (or an estimate if it reports none). */
export function recordImageUsage(
  operation: string,
  size: string,
  references: number,
  retries: number,
  reported?: OpenAI.Images.ImagesResponse["usage"],
  quality: Quality = imageQuality(),
): void {
  const model = IMAGE_MODEL();
  const image = { size, quality, references };
  if (!reported) {
    recordUsage({ provider: "openai", model, operation, image, retries, usd: imageCost(model, size, quality, references), measured: false });
    return;
  }
  const imageInput = reported.input_tokens_details?.image_tokens ?? 0;
  const tokens = { textInput: reported.input_tokens - imageInput, imageInput, output: reported.output_tokens };
  recordUsage({
    provider: "openai",
    model,
    operation,
    inputTokens: reported.input_tokens,
    outputTokens: reported.output_tokens,
    image,
    retries,
    usd: imageTokenCost(tokens),
    measured: true,
  });
}

/**
 * Test mode (COMICME_FAKE_IMAGES=1): a grey placeholder instead of a paid picture, so the whole
 * flow (storyboard approval, drawing, lettering, Explore) can be clicked through for free.
 */
export function fakeImagesEnabled(): boolean {
  return process.env.COMICME_FAKE_IMAGES === "1";
}

export async function fakeImage(size: string, label: string): Promise<Buffer> {
  const [width, height] = size.split("x").map(Number);
  const safe = label.replace(/[<>&"]/g, "").slice(0, 60);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#d4d4d4"/><path d="M0 0L${width} ${height}M${width} 0L0 ${height}" stroke="#a3a3a3" stroke-width="6"/><text x="50%" y="50%" font-family="sans-serif" font-size="${Math.round(Math.min(width, height) / 9)}" text-anchor="middle" fill="#525252">TEST ${safe}</text></svg>`;
  const { default: sharp } = await import("sharp");
  return sharp(Buffer.from(svg)).webp({ quality: 70 }).toBuffer();
}

/** Draws one image; with reference pictures it uses OpenAI's edit endpoint so the characters match them. */
export async function drawImage(job: ArtJob): Promise<Buffer> {
  if (fakeImagesEnabled()) {
    recordUsage({ provider: "openai", model: "test-placeholder", operation: "image.fake", image: { size: job.size, quality: "test", references: job.references.length }, usd: 0, measured: false });
    return fakeImage(job.size, job.label ?? "picture");
  }
  const client = imageClient();
  const quality = job.quality ?? imageQuality();
  const common = {
    model: IMAGE_MODEL(),
    prompt: job.prompt,
    size: job.size,
    quality,
    output_format: "webp" as const,
    output_compression: 88,
  };

  let retries = 0;
  const result = await withRateLimitRetry(
    async () => {
      if (job.references.length === 0) return client.images.generate(common);
      const image = await Promise.all(job.references.map(referenceFile));
      return client.images.edit({ ...common, image });
    },
    () => retries++,
  );
  recordImageUsage(job.references.length ? "image.edit" : "image.generate", job.size, job.references.length, retries, result.usage, quality);

  const base64 = result.data?.[0]?.b64_json;
  if (!base64) {
    throw new UserFacingError("The image service didn't return a picture. Please try again.", 502);
  }
  return Buffer.from(base64, "base64");
}
