import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { MAX_PAGES, MAX_PANELS, type ComicScript, type Page } from "../comic";
import { requireEnv, UserFacingError } from "../errors";
import { fitLayout, LAYOUT_IDS, layoutMenu } from "../layouts";
import type { ComicStyle } from "../styles";

// Story Engine: turns the user's story into a multi-page comic script using Claude, in two passes:
//   1. The writer builds a story bible, then plans pages and writes every panel.
//   2. The editor rereads it as a first-time reader and sharpens captions and dialogue.

const MODEL = "claude-opus-5-5";

const DialogueSchema = z.object({
  speaker: z.string().describe("Character name, exactly as in the character list"),
  side: z.enum(["left", "right"]).describe("Which side of the panel the speaker stands on"),
  kind: z
    .enum(["speech", "shout", "whisper", "thought"])
    .describe("Balloon type: normal speech, shouting/excited, whispering, or unspoken thought"),
  text: z.string().describe("Balloon text, at most 20 words"),
});

const LetteringSchema = z.object({
  caption: z.string().describe("Narrator caption, at most 25 words. Empty string if none."),
  dialogue: z.array(DialogueSchema).describe("0 to 3 balloons, in reading order"),
});

const ScriptSchema = z.object({
  bible: z.object({
    logline: z.string().describe("One sentence: whose story this is and what it's really about"),
    tone: z.string(),
    arc: z.string().describe("The emotional journey from first page to last, in 2-3 sentences"),
    voices: z
      .array(z.object({ name: z.string(), voice: z.string().describe("How this person talks: rhythm, words, humour") }))
      .describe("Every speaking character"),
  }),
  title: z.string().describe("Short, evocative comic title (max 6 words)"),
  tagline: z.string().describe("Cover tagline, max 10 words"),
  characters: z.array(
    z.object({
      name: z.string(),
      appearance: z
        .string()
        .describe(
          "Fixed visual description reused in every panel: age, build, skin tone, face, hair, signature outfit and colours",
        ),
    }),
  ),
  cover: z.object({
    scene: z.string().describe("The cover illustration: the main characters in one iconic image that sums up the story"),
  }),
  pages: z.array(
    z.object({
      layout: z.enum(LAYOUT_IDS),
      panels: z.array(
        LetteringSchema.extend({
          shot: z.enum(["establishing", "wide", "medium", "close-up", "extreme close-up"]),
          scene: z
            .string()
            .describe(
              "What the artist draws: setting, time of day, who is in frame (by name), poses, expressions, key props, mood. No dialogue.",
            ),
        }),
      ),
    }),
  ),
});

const EditSchema = z.object({
  title: z.string(),
  tagline: z.string(),
  pages: z.array(z.object({ panels: z.array(LetteringSchema) })),
});

const WRITER_PROMPT = `You are the head writer at Comic.me, a studio that turns people's real stories into beautiful printed comic books.

You'll get someone's story and an art style. Turn it into a complete comic script that an illustrator, who has never read the story, can draw page by page.

## Work in this order
1. **Story bible.** Who is this about, what is it really about, the tone, the emotional arc, and how each person talks.
2. **Length.** Let the material decide, leaning generous because people print these: a few sentences → about 4-6 pages; a detailed story → 8-${MAX_PAGES} pages. Never more than ${MAX_PAGES} pages or ${MAX_PANELS} panels in total (excluding the cover). Typical: 6-10 pages, 25-${MAX_PANELS} panels.
3. **Page plan.** Choose a layout per page, like a comic artist pacing a book:
${layoutMenu()}
   - Panel size controls time: big panels slow the reader down for important moments; many small panels speed things up.
   - Use "splash" for at most 2 of the very biggest moments (the turning point, the ending). Vary layouts; don't repeat one layout on consecutive pages.
   - End pages on a small hook or turn so the reader wants to turn the page. Give the final page a satisfying, emotional ending.
   - The number of panels on a page must exactly match its layout.
4. **Panels.** For each panel choose a shot, describe the scene for the artist, and write the caption and balloons.

## Writing that makes sense to a stranger
- Write for a reader who doesn't know these people. Every page must make sense on its own and in sequence.
- Captions establish context: when and where we are, what changed, time jumps ("Two years later, Toronto."), and why the moment matters.
- Dialogue reveals who people are to each other and what's at stake. Make lines specific to this story, not generic: not "You did it!" but "You actually got the Toronto job!"
- Introduce each person by name early, in a caption or dialogue.
- Keep it short and readable: captions at most 25 words, balloons at most 20 words, at most 3 balloons per panel. Some panels can be silent if the picture says it.
- Use balloon kinds: "shout" for excitement or yelling, "whisper" for quiet asides, "thought" for unspoken feelings.

## Truthfulness
- Stay true to the facts, names, places and order of events. You may dramatise small connecting moments (a phone call, a walk home) and invent natural dialogue, but never invent major life events.
- Write in the same language as the story.

## Drawing instructions
- In each scene, describe only what is visible. Name every character in frame; put each speaker on the side given in their balloon.
- Give each recurring character one fixed, specific appearance in the character list (if the story doesn't say, choose a plausible look) and keep it identical throughout. If they age over the story, describe the change in the scene.
- Match the art style's storytelling sensibility.`;

const EDITOR_PROMPT = `You are the editor at Comic.me. A writer has turned someone's real story into a comic script. Your job: make every caption and balloon land for a first-time reader.

Read the original story, then the script page by page as if you had never heard the story. For every panel ask:
- Do I know where and when we are, and what just changed? If not, fix the caption.
- Do I know who is speaking and what they are to each other?
- Is each line specific to this story, or vague and generic? Does it only make sense if I already know the story?
- Is anything repetitive, flat, or over-explained? Does the dialogue sound like these particular people (see the voices in the bible)?
- Do the ending and the page turns land emotionally?

Rewrite captions and balloons where needed: clarity through specificity, not length. Captions at most 25 words, balloons at most 20 words, at most 3 balloons per panel. Keep the facts true to the original story.

Rules:
- Return exactly the same number of pages, and the same number of panels on each page, in the same order.
- Each balloon's speaker must be someone in that panel's scene, and keep each speaker's side.
- You may also polish the title and tagline.`;

function client() {
  return new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
}

async function callClaude<S extends z.ZodType>(
  system: string,
  user: string,
  schema: S,
  effort: "medium" | "high",
): Promise<z.infer<S>> {
  const stream = client().beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    // If Claude's safety filters decline, the API retries on a fallback model automatically.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content: user }],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === "refusal") {
    throw new UserFacingError(
      "Our story writer couldn't turn this story into a comic. Try rewording it or leaving out sensitive details.",
    );
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new UserFacingError("The comic script came back incomplete. Please try again.", 502);
  }
  return response.parsed_output as z.infer<S>;
}

/** Pass 1: the writer. */
export async function writeScript(story: string, style: ComicStyle): Promise<ComicScript> {
  const draft = await callClaude(
    WRITER_PROMPT,
    `Art style: ${style.label} — ${style.blurb}. Storytelling sensibility: ${style.storytelling}\n\n<story>\n${story}\n</story>`,
    ScriptSchema,
    "high",
  );

  const pages: Page[] = draft.pages
    .filter((page) => page.panels.length > 0)
    .slice(0, MAX_PAGES)
    .map((page) => {
      const panels = page.panels.slice(0, 6).map((panel) => ({ ...panel, dialogue: panel.dialogue.slice(0, 3) }));
      return { layout: fitLayout(page.layout, panels.length), panels };
    });
  if (pages.length === 0) {
    throw new UserFacingError("The comic script came back empty. Please try again.", 502);
  }

  return {
    title: draft.title,
    tagline: draft.tagline,
    bible: draft.bible,
    characters: draft.characters,
    cover: draft.cover,
    pages,
  };
}

/** Pass 2: the editor. Only captions, balloons, title and tagline change; the art plan stays the same. */
export async function polishScript(story: string, script: ComicScript): Promise<ComicScript> {
  const edit = await callClaude(
    EDITOR_PROMPT,
    `<original_story>\n${story}\n</original_story>\n\n<script>\n${JSON.stringify(script, null, 1)}\n</script>`,
    EditSchema,
    "medium",
  );

  return {
    ...script,
    title: edit.title.trim() || script.title,
    tagline: edit.tagline.trim() || script.tagline,
    pages: script.pages.map((page, p) => {
      const edited = edit.pages[p];
      // If the editor changed the structure of a page, keep the writer's version of it.
      if (!edited || edited.panels.length !== page.panels.length) return page;
      return {
        ...page,
        panels: page.panels.map((panel, i) => ({
          ...panel,
          caption: edited.panels[i].caption,
          dialogue: edited.panels[i].dialogue.slice(0, 3),
        })),
      };
    }),
  };
}
