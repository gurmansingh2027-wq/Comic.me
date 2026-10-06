import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { PANEL_COUNT, type ComicScript } from "../comic";
import { requireEnv, UserFacingError } from "../errors";
import type { ComicStyle } from "../styles";

// Story Engine: turns the user's story into a 6-panel comic script using Claude.

const MODEL = "claude-opus-5-5";

const ScriptSchema = z.object({
  title: z.string().describe("Short, punchy comic title (max 6 words)"),
  characters: z
    .array(
      z.object({
        name: z.string(),
        appearance: z
          .string()
          .describe(
            "Fixed visual description reused in every panel: age, build, skin tone, hair, face, signature outfit and colours",
          ),
      }),
    )
    .describe("Every recurring character who appears in the panels"),
  panels: z.array(
    z.object({
      scene: z
        .string()
        .describe(
          "What the artist should draw: setting, who is in frame, poses, expressions, camera angle, mood. Use character names. No dialogue here.",
        ),
      caption: z.string().describe("Optional narrator caption (max 15 words). Empty string if none."),
      dialogue: z
        .array(
          z.object({
            speaker: z.string().describe("Character name"),
            side: z.enum(["left", "right"]).describe("Which side of the frame this speaker stands on"),
            text: z.string().describe("Speech bubble text, max 15 words"),
          }),
        )
        .describe("0 to 2 speech bubbles, in reading order"),
    }),
  ),
});

const SYSTEM_PROMPT = `You are the head writer at Comic.me, a studio that turns people's real stories into short, heartfelt comics.

Turn the story you are given into a script for exactly ${PANEL_COUNT} comic panels that will be drawn one by one by an illustrator who has never read the story.

How to write it:
- Shape a clear arc across the ${PANEL_COUNT} panels: a hook that sets the scene, a few key turning points, and a satisfying, emotional or funny final panel.
- Pick the moments that matter most. Compress or skip the rest; don't try to cram every detail in.
- Stay true to the facts, names and places in the story. You may invent small visual details and natural-sounding dialogue that fit.
- Keep text short so it fits in bubbles: captions and each speech bubble at most 15 words, at most 2 bubbles per panel. Some panels can be silent.
- In each panel's scene, describe only what is visible. Mention every character in frame by name, and put speakers on the side of the frame given in their dialogue line.
- Give each recurring character one fixed appearance in the character list and keep it the same throughout. If the story doesn't say what someone looks like, choose a plausible, specific look.
- Match the tone and pacing to the chosen art style.
- Write in the same language as the story.`;

export async function generateScript(story: string, style: ComicStyle): Promise<ComicScript> {
  const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // If Claude's safety filters decline, the API retries on a fallback model automatically.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: betaZodOutputFormat(ScriptSchema),
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Art style: ${style.label} — ${style.blurb}.\n\n<story>\n${story}\n</story>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new UserFacingError(
      "Our story writer couldn't turn this story into a comic. Try rewording it or leaving out sensitive details.",
    );
  }

  const script = response.parsed_output;
  if (!script || script.panels.length < PANEL_COUNT) {
    throw new UserFacingError("The comic script came back incomplete. Please try again.", 502);
  }

  return {
    ...script,
    panels: script.panels.slice(0, PANEL_COUNT).map((panel) => ({
      ...panel,
      dialogue: panel.dialogue.slice(0, 2),
    })),
  };
}
