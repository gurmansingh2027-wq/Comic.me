import "server-only";
import OpenAI from "openai";
import type { ComicScript, Panel } from "../comic";
import { requireEnv, UserFacingError } from "../errors";
import type { ComicStyle } from "../styles";

// Art Engine: draws one panel's artwork (no text — our renderer adds bubbles on top).
// Kept to a single function so OpenAI can later be swapped for FLUX / fal.ai.

const DEFAULT_IMAGE_MODEL = "gpt-image-2";

export function buildPanelPrompt(script: ComicScript, panel: Panel, style: ComicStyle): string {
  const sceneText = `${panel.scene} ${panel.dialogue.map((line) => line.speaker).join(" ")}`.toLowerCase();
  const cast = script.characters.filter((character) => sceneText.includes(character.name.toLowerCase()));

  const placements = [...new Map(panel.dialogue.map((line) => [line.speaker, line.side])).entries()].map(
    ([speaker, side]) => `${speaker} is on the ${side} side of the frame.`,
  );
  const hasText = panel.caption.trim() !== "" || panel.dialogue.length > 0;

  return [
    "A single comic book panel illustration, square format.",
    `Art style: ${style.art}`,
    `Scene: ${panel.scene}`,
    cast.length > 0 &&
      `Characters (keep their appearance exactly as described):\n${cast
        .map((character) => `- ${character.name}: ${character.appearance}`)
        .join("\n")}`,
    placements.length > 0 && `Composition: ${placements.join(" ")}`,
    hasText &&
      "Keep the top quarter of the image calm and uncluttered (simple background) because speech bubbles will be placed there later.",
    "IMPORTANT: Do not draw any text, letters, words, numbers, captions, speech bubbles, sound effects, signatures or watermarks anywhere in the image.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generatePanelImage(prompt: string): Promise<Buffer> {
  const client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

  const result = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL,
    prompt,
    size: "1024x1024",
    quality: "medium",
    output_format: "webp",
    output_compression: 85,
  });

  const base64 = result.data?.[0]?.b64_json;
  if (!base64) {
    throw new UserFacingError("The image service didn't return a picture. Please try this panel again.", 502);
  }
  return Buffer.from(base64, "base64");
}
