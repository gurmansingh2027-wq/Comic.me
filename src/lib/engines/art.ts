import "server-only";
import OpenAI from "openai";
import type { ComicScript } from "../comic";
import { requireEnv, UserFacingError } from "../errors";
import { COVER_SIZE, describeShape, imageSizeForAspect, LAYOUTS, panelAspect } from "../layouts";
import type { ComicStyle } from "../styles";

// Art Engine: draws the cover and each panel (no text — our renderer letters on top).
// Kept to plain functions so OpenAI can later be swapped for FLUX / fal.ai.

const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const QUALITIES = ["low", "medium", "high"] as const;
type Quality = (typeof QUALITIES)[number];

const NO_TEXT =
  "IMPORTANT: Do not draw any text, letters, words, numbers, captions, speech balloons, sound-effect lettering, logos, signatures or watermarks anywhere in the image. No panel borders or multiple panels: one single continuous illustration.";

export type ArtJob = { prompt: string; size: string };

function castFor(script: ComicScript, text: string): string | false {
  const lower = text.toLowerCase();
  const cast = script.characters.filter((character) => lower.includes(character.name.toLowerCase()));
  return (
    cast.length > 0 &&
    `Characters (keep their appearance exactly as described):\n${cast
      .map((character) => `- ${character.name}: ${character.appearance}`)
      .join("\n")}`
  );
}

export function coverJob(script: ComicScript, style: ComicStyle): ArtJob {
  const scene = script.cover?.scene ?? script.pages[0].panels[0].scene;
  const prompt = [
    "The front cover illustration of a comic book, portrait format.",
    `Art style: ${style.art}`,
    `Cover image: ${scene}`,
    castFor(script, scene),
    "Composition: an iconic, eye-catching cover. Keep the top third of the image as simple background (sky, wall, soft gradient) because the title will be added there later. Main characters large in the lower two-thirds.",
    NO_TEXT,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { prompt, size: COVER_SIZE };
}

export function panelJob(script: ComicScript, pageIndex: number, panelIndex: number, style: ComicStyle): ArtJob {
  const page = script.pages[pageIndex];
  const panel = page.panels[panelIndex];
  const rect = LAYOUTS[page.layout].panels[panelIndex];
  const aspect = panelAspect(rect);

  const placements = [...new Map(panel.dialogue.map((line) => [line.speaker, line.side])).entries()].map(
    ([speaker, side]) => `${speaker} is on the ${side} side of the frame.`,
  );
  const hasLettering = panel.caption.trim() !== "" || panel.dialogue.length > 0;
  const sceneText = `${panel.scene} ${panel.dialogue.map((line) => line.speaker).join(" ")}`;

  const prompt = [
    `A single comic book panel illustration: ${describeShape(aspect)}.`,
    `Art style: ${style.art}`,
    `Shot: ${panel.shot}.`,
    `Scene: ${panel.scene}`,
    castFor(script, sceneText),
    placements.length > 0 && `Composition: ${placements.join(" ")}`,
    hasLettering &&
      "Leave room for lettering: keep the top third of the image as calm, simple background (sky, wall, ceiling). Frame the characters so their heads and faces sit below the top third, never at the very top of the frame.",
    NO_TEXT,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { prompt, size: imageSizeForAspect(aspect) };
}

function quality(): Quality {
  const value = process.env.OPENAI_IMAGE_QUALITY?.trim() as Quality;
  return QUALITIES.includes(value) ? value : "medium";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * New OpenAI accounts may only draw a few images per minute. When we hit that limit,
 * wait as long as OpenAI asks ("try again in 12s") and try again, instead of failing.
 */
async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
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

export async function drawImage(job: ArtJob): Promise<Buffer> {
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY"), maxRetries: 1 });

  const result = await withRateLimitRetry(() => client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL,
    prompt: job.prompt,
    size: job.size,
    quality: quality(),
    output_format: "webp",
    output_compression: 88,
  }));

  const base64 = result.data?.[0]?.b64_json;
  if (!base64) {
    throw new UserFacingError("The image service didn't return a picture. Please try again.", 502);
  }
  return Buffer.from(base64, "base64");
}
