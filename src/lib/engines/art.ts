import "server-only";
import { createReadStream } from "node:fs";
import OpenAI, { toFile } from "openai";
import type { ComicScript, Importance } from "../comic";
import { mentionsCharacter } from "../cast-matching";
import { requireEnv, UserFacingError } from "../errors";
import { COVER_SIZE, describeShape, imageSizeForAspect, LAYOUTS, panelAspect } from "../layouts";
import type { ComicStyle } from "../styles";

// Art Engine: draws the cover, each panel and character designs (no text — our renderer
// letters on top). Approved character designs are passed in as reference images so every
// panel keeps the same faces and outfits. Kept to plain functions so OpenAI can later be
// swapped for FLUX / fal.ai.

const QUALITIES = ["low", "medium", "high"] as const;
type Quality = (typeof QUALITIES)[number];
/** Most reference images we send with one panel. */
const MAX_REFERENCES = 4;

export const IMAGE_MODEL = () => process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";

export function imageQuality(): Quality {
  const value = process.env.OPENAI_IMAGE_QUALITY?.trim() as Quality;
  return QUALITIES.includes(value) ? value : "medium";
}

const NO_TEXT =
  "IMPORTANT: Do not draw any text, letters, words, numbers, captions, speech balloons, sound-effect lettering, logos, signatures or watermarks anywhere in the image. No panel borders or multiple panels: one single continuous illustration.";

/** A character with an approved design, available as a reference picture. */
export type CastRef = { name: string; description: string; designPath: string; importance?: Importance };

export type ArtJob = { prompt: string; size: string; references: string[] };

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
        `- ${ref.name}: reference image ${i + 1 + offset} is their character design. Draw them exactly like it (face, hair, build, outfit, colours). ${ref.description}`,
    ),
    ...others.map((character) => `- ${character.name}: ${character.appearance}`),
  ];
  return {
    notes: lines.length > 0 && `Characters (keep their appearance exactly as described):\n${lines.join("\n")}`,
    references: designed.map((ref) => ref.designPath),
  };
}

export function coverJob(script: ComicScript, style: ComicStyle, castRefs: CastRef[] = [], revision?: Revision): ArtJob {
  const scene = script.cover?.scene ?? script.pages[0].panels[0].scene;
  const cast = castFor(script, scene, castRefs, revision ? 1 : 0);
  const prompt = [
    revisionNotes(revision),
    "The front cover illustration of a comic book, portrait format.",
    `Art style: ${style.art}`,
    `Cover image: ${scene}`,
    cast.notes,
    "Composition: an iconic, eye-catching cover. Keep the top third of the image as simple background (sky, wall, soft gradient) because the title will be added there later. Main characters large in the lower two-thirds.",
    NO_TEXT,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { prompt, size: COVER_SIZE, references: [...(revision ? [revision.currentPath] : []), ...cast.references] };
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
  const cast = castFor(script, `${panel.scene} ${panel.dialogue.map((line) => line.speaker).join(" ")}`, castRefs, revision ? 1 : 0);

  const prompt = [
    revisionNotes(revision),
    `A single comic book panel illustration: ${describeShape(aspect)}.`,
    `Art style: ${style.art}`,
    `Shot: ${panel.shot}.`,
    `Scene: ${panel.scene}`,
    cast.notes,
    placements.length > 0 && `Composition: ${placements.join(" ")}`,
    hasLettering &&
      "Leave room for lettering: keep the top third of the image as calm, simple background (sky, wall, ceiling). Frame the characters so their heads and faces sit below the top third, never at the very top of the frame.",
    NO_TEXT,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    prompt,
    size: imageSizeForAspect(aspect),
    references: [...(revision ? [revision.currentPath] : []), ...cast.references],
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
export async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof OpenAI.RateLimitError) || attempt >= 8 || /quota|billing/i.test(error.message)) throw error;
      const seconds = Number(/try again in ([\d.]+)s/i.exec(error.message)?.[1] ?? 15);
      await sleep((seconds + 1 + Math.random() * 4) * 1000);
    }
  }
}

/** Draws one image; with reference pictures it uses OpenAI's edit endpoint so the characters match them. */
export async function drawImage(job: ArtJob): Promise<Buffer> {
  const client = imageClient();
  const common = {
    model: IMAGE_MODEL(),
    prompt: job.prompt,
    size: job.size,
    quality: imageQuality(),
    output_format: "webp" as const,
    output_compression: 88,
  };

  const result = await withRateLimitRetry(async () => {
    if (job.references.length === 0) return client.images.generate(common);
    const image = await Promise.all(job.references.map(referenceFile));
    return client.images.edit({ ...common, image });
  });

  const base64 = result.data?.[0]?.b64_json;
  if (!base64) {
    throw new UserFacingError("The image service didn't return a picture. Please try again.", 502);
  }
  return Buffer.from(base64, "base64");
}
