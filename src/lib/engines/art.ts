import "server-only";
import { createReadStream } from "node:fs";
import OpenAI, { toFile } from "openai";
import type { ComicScript, CoverDesign, Importance, SceneContext } from "../comic";
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
/** Most reference images we send with one panel. */
const MAX_REFERENCES = 4;

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

function revisionNotes(revision: Revision | undefined): string | false {
  return (
    !!revision &&
    `This is a redraw. Reference image 1 is the current version of this picture. Redraw it with this change requested by the reader (the most important instruction; apply it clearly): ${revision.feedback.trim() || "a better, more striking version of the same moment"}. Keep everything the change doesn't affect: the same moment, characters, setting, colours and art style.`
  );
}

/** Character notes for the prompt, plus which design pictures to send as references. */
function castFor(script: ComicScript, text: string, castRefs: CastRef[], offset = 0): { notes: string | false; references: string[] } {
  const names = [...script.characters.map((c) => c.name), ...castRefs.map((c) => c.name)];
  const priority = { main: 0, supporting: 1, minor: 2 };
  const designed = castRefs.filter((ref) => mentionsCharacter(text, ref.name, names))
    .sort((a, b) => priority[a.importance ?? "supporting"] - priority[b.importance ?? "supporting"])
    .slice(0, MAX_REFERENCES);
  const others = script.characters.filter(
    (character) => mentionsCharacter(text, character.name, names) && !designed.some((ref) => ref.name === character.name),
  );

  const lines = [
    ...designed.map(
      (ref, i) =>
        `- ${ref.name}: reference image ${i + 1 + offset} is their character design. Draw them exactly like it (face, hair, build, distinctive features). ${ref.description}`,
    ),
    ...others.map((character) => `- ${character.name}: ${character.appearance}`),
  ];
  return {
    notes: lines.length > 0 && `Characters (keep their appearance exactly as described):\n${lines.join("\n")}`,
    references: designed.map((ref) => ref.designPath),
  };
}

const sameName = (a: string, b: string) => a.normalize("NFKC").toLowerCase().trim() === b.normalize("NFKC").toLowerCase().trim();

/**
 * Builds the character and setting notes for a panel from its structured scene context: each
 * person's design for the right age is sent as a reference for WHO they are, while their
 * clothes come from the scene, not from the design sheet.
 */
function contextFor(script: ComicScript, context: SceneContext, castRefs: CastRef[], offset: number): { notes: string; references: string[] } {
  const references: string[] = [];
  const priority = { main: 0, supporting: 1, minor: 2 };
  const people = [...context.cast].sort((a, b) => {
    const ra = castRefs.find((ref) => sameName(ref.name, a.name));
    const rb = castRefs.find((ref) => sameName(ref.name, b.name));
    return priority[ra?.importance ?? "minor"] - priority[rb?.importance ?? "minor"];
  });

  const lines = people.map((person) => {
    // Clothes always come from this panel's scene, never from the design sheet.
    const ref = castRefs.find((candidate) => sameName(candidate.name, person.name));
    const stage = person.stage ? ref?.stages?.find((candidate) => candidate.id === person.stage) : undefined;
    const designPath = stage ? stage.designPath : ref?.designPath;
    const who = `${person.name}${stage ? ` (${stage.label})` : ""}`;
    const scene = `In this panel they wear: ${person.wardrobe || "clothes that fit the scene"}. Feeling: ${person.emotion || "as the scene suggests"}. Doing: ${person.action || "as described"}.`;
    if (designPath && references.length < MAX_REFERENCES) {
      references.push(designPath);
      return `- ${who}: reference image ${references.length + offset} is their character design${stage ? " at this age" : ""}. Copy who they are exactly (face, features, skin tone, hair, build, distinctive markers) but NOT the outfit on the sheet. ${scene}`;
    }
    const character = script.characters.find((candidate) => sameName(candidate.name, person.name));
    const look = stage?.look ?? ref?.description ?? character?.appearance ?? "";
    return `- ${who}: ${look} ${scene}`;
  });

  const setting = [
    context.location && `Location: ${context.location}.`,
    [context.period, context.timeOfDay, context.weather].filter(Boolean).length > 0 &&
      `When: ${[context.period, context.timeOfDay, context.weather].filter(Boolean).join(", ")}.`,
    context.event && `Occasion: ${context.event}.`,
    context.activity && `What's happening: ${context.activity}.`,
    context.relationships && `Between them: ${context.relationships}.`,
    context.camera && `Camera: ${context.camera}.`,
    context.objects.length > 0 && `Important objects: ${context.objects.join(", ")}.`,
    context.continuity && `Continuity with the previous panel: ${context.continuity}`,
  ].filter(Boolean);

  const clothes =
    references.length > 0 &&
    "Clothes: everyone wears the outfit listed for THIS panel (it fits their age, the place, the occasion, the weather and the era). The outfits on the reference design sheets are only examples and must not be copied.";
  return {
    notes: [setting.join(" "), lines.length > 0 && `Characters:\n${lines.join("\n")}`, clothes].filter(Boolean).join("\n\n"),
    references,
  };
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

export function coverJob(script: ComicScript, style: ComicStyle, castRefs: CastRef[] = [], revision?: Revision): ArtJob {
  const scene = script.cover?.scene ?? script.pages[0].panels[0].scene;
  const design = script.cover?.design;
  const cast = castFor(script, scene, castRefs, revision ? 1 : 0);
  const prompt = [
    revisionNotes(revision),
    "The front cover of a premium comic book, portrait format, by a world-class cover artist and designer: an authored, art-directed image where illustration and graphic design work together.",
    `Art style: ${style.art}`,
    design && `Cover concept: ${design.concept}`,
    `Composition family: ${familyGuidance(design?.approach)}. Commit to it fully; don't fall back to a centred character posing in front of a background.`,
    `Cover brief: ${scene}`,
    cast.notes,
    "Craft: one clear idea readable at thumbnail size; a strong silhouette; deliberate negative space; a limited palette with one accent colour; finished, confident rendering where it matters and restraint everywhere else.",
    titleSpace(design),
    NO_TEXT,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { prompt, size: COVER_SIZE, references: [...(revision ? [revision.currentPath] : []), ...cast.references], label: "cover" };
}

export function panelJob(
  script: ComicScript,
  pageIndex: number,
  panelIndex: number,
  style: ComicStyle,
  castRefs: CastRef[] = [],
  revision?: Revision,
): ArtJob {
  const page = script.pages[pageIndex];
  const panel = page.panels[panelIndex];
  const rect = LAYOUTS[page.layout].panels[panelIndex];
  const aspect = panelAspect(rect);

  const placements = [...new Map(panel.dialogue.map((line) => [line.speaker, line.side])).entries()].map(
    ([speaker, side]) => `${speaker} is on the ${side} side of the frame.`,
  );
  const hasLettering = panel.caption.trim() !== "" || panel.dialogue.length > 0;
  const offset = revision ? 1 : 0;
  const cast = panel.context
    ? contextFor(script, panel.context, castRefs, offset)
    : castFor(script, `${panel.scene} ${panel.dialogue.map((line) => line.speaker).join(" ")}`, castRefs, offset);

  // Neighbouring panels, so each picture (and every redraw) flows with the story around it.
  const flat = script.pages.flatMap((pg) => pg.panels);
  const at = script.pages.slice(0, pageIndex).reduce((sum, pg) => sum + pg.panels.length, 0) + panelIndex;
  const neighbours = [
    flat[at - 1] && `Previous panel showed: ${flat[at - 1].scene.slice(0, 240)}`,
    flat[at + 1] && `Next panel will show: ${flat[at + 1].scene.slice(0, 240)}`,
  ].filter(Boolean);

  const hero =
    panel.hero &&
    `HERO PANEL: this is one of the one or two moments in the whole book that readers will remember${panel.heroReason ? ` (${panel.heroReason})` : ""}. Make it a jaw-dropping, authored image, not a routine panel: ${style.direction.hero} Push the camera further than any other panel, give it a bold foreground shape and a clear focal point, and render the environment and light with splash-page ambition.`;
  const prompt = [
    revisionNotes(revision),
    `A single comic book panel illustration: ${describeShape(aspect)}.`,
    frameNote(rect),
    `Art style: ${style.art}`,
    hero,
    `Shot: ${panel.shot}.`,
    `Scene: ${panel.scene}`,
    cast.notes,
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
    size: panel.hero ? imageSizeForAspect(aspect, HERO_PIXELS) : imageSizeForAspect(aspect),
    references: [...(revision ? [revision.currentPath] : []), ...cast.references],
    quality: panel.hero ? heroQuality() : undefined,
    label: `panel ${pageIndex + 1}-${panelIndex + 1}${panel.hero ? " ★" : ""}`,
  };
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
