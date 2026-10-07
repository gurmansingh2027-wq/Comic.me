import "server-only";
import { z } from "zod";
import { MAX_PAGES, MAX_PANELS, type CastMember, type ComicScript, type Page } from "../comic";
import { askClaude } from "../claude";
import { UserFacingError } from "../errors";
import { fitLayout, LAYOUT_IDS, layoutMenu } from "../layouts";
import type { ComicStyle } from "../styles";

// Story Engine: turns the user's story into a multi-page comic script using Claude, in two passes:
//   1. The Comic Director builds a story bible, interprets the story in the chosen style, plans
//      pages, and writes every panel WITH its structured scene context (who, which age, what they
//      wear, where, when, mood, props, continuity), so pictures are built from facts.
//   2. The editor rereads it as a first-time reader and sharpens captions and dialogue.

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

const ContextSchema = z.object({
  location: z.string().describe("Specific place; reuse the exact same wording for every panel in the same place"),
  period: z.string().describe('Year or era, e.g. "2016", "summer 1958", "college years"'),
  timeOfDay: z.string(),
  weather: z.string().describe('e.g. "monsoon rain", "clear winter night", "indoors"'),
  event: z.string().describe('What occasion this is, e.g. "college fest", "wedding reception", "ordinary school morning"'),
  cast: z
    .array(
      z.object({
        name: z.string().describe("Exact cast name"),
        stage: z.string().describe('Life stage id from the cast list, or "main" for their main age'),
        wardrobe: z.string().describe("What they wear in THIS scene, fitting age, era, place, activity, event, weather and culture"),
        emotion: z.string(),
        action: z.string().describe("What they are doing / their pose"),
      }),
    )
    .describe("Everyone visible in the panel"),
  objects: z.array(z.string()).describe("Props that matter in this panel"),
  continuity: z.string().describe("What must match the previous panel (same clothes in the same scene, props in hand, mess, light); empty if a new scene"),
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
          "Who they are visually (face, skin, hair, build, distinctive markers). NOT clothing: clothes are chosen per scene.",
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
              "What the artist draws, as a vivid shot description in this style: composition, who is in frame (by name), poses, expressions, key props, mood. No dialogue.",
            ),
          context: ContextSchema,
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

const WRITER_PROMPT = `You are the Comic Director at Comic.me, a studio that turns people's stories into beautiful printed comic books. You decide how the story is told visually: what each page is for, where the big moments land, how every panel is shot, and what everyone looks like and wears in each scene.

You'll get someone's story, the art style with its storytelling direction, and (usually) the cast's Character Bible. Produce a complete comic script that illustrators who have never read the story can draw page by page.

## Work in this order
1. **Story bible.** Who is this about, what is it really about, the tone, the emotional arc, and how each person talks.
2. **Interpret the story in THIS style.** Style is not a filter. The same story must be directed differently in different styles: a prestige superhero book turns a missed flight into a heroic sprint under a giant departure board; an absurd comedy makes the security scanner sentient; a quiet ink book shows a clock, a running figure and a tiny plane leaving. Follow the style's interpretation, camera, pacing and panel density closely.
3. **Length.** Let the material decide, leaning generous because people print these: a few sentences → about 4-6 pages; a detailed story → 8-${MAX_PAGES} pages. Never more than ${MAX_PAGES} pages or ${MAX_PANELS} panels in total (excluding the cover). Typical: 6-10 pages, 25-${MAX_PANELS} panels.
4. **Page plan.** Choose a layout per page, like a comic artist pacing a book:
${layoutMenu()}
   - Narrative importance sets panel size: big panels and splashes for turning points and emotional peaks; small panels for quick beats, banter and build-up; quiet silent panels to let a feeling land.
   - Use "splash" for at most 2 of the very biggest moments. Vary layouts; don't repeat one layout on consecutive pages.
   - End pages on a hook or turn so the reader wants to turn the page. Give the final page a satisfying ending.
   - The number of panels on a page must exactly match its layout.
5. **Panels.** For each panel: a shot, a vivid scene description, its scene context, and the caption and balloons.

## Scene context (filled in for every panel)
- Track time precisely. When the story jumps in time, everyone's age changes: pick each person's life stage from the cast list ("main" or a stage id) so children look like children and the old look old.
- Wardrobe comes from the scene, never from habit: age, era, place, activity, event, weather and culture decide what people wear (school uniform at school, casual at college, festive or wedding clothes at a wedding, workwear at work, sportswear on court, layers in winter). Within one continuous scene, clothes stay the same; a new day or occasion means new clothes.
- Reuse the exact same location wording for panels in the same place, and note continuity (props in hand, spilled tea, rain-soaked clothes) from the previous panel.
- Identity never changes: a person keeps their face, skin, hair identity and distinctive markers in every panel, at every age and in every outfit.

## Writing that makes sense to a stranger
- Write for a reader who doesn't know these people. Every page must make sense on its own and in sequence.
- Captions establish context: when and where we are, what changed, time jumps ("Two years later, Toronto."), and why the moment matters.
- Dialogue reveals who people are to each other and what's at stake. Make lines specific to this story, not generic: not "You did it!" but "You actually got the Toronto job!"
- Introduce each person by name early, in a caption or dialogue.
- Keep it short and readable: captions at most 25 words, balloons at most 20 words, at most 3 balloons per panel. Some panels can be silent if the picture says it.
- Use balloon kinds: "shout" for excitement or yelling, "whisper" for quiet asides, "thought" for unspoken feelings.

## Truthfulness and originality
- For real memories, stay true to the facts, names, places and order of events; you may dramatise small connecting moments and invent natural dialogue, but never invent major life events. For ideas and fantasies, build freely in their spirit.
- Never use recognisable copyrighted characters, creatures, logos or mascots; design originals (an original giant monster, not a famous one).
- Write in the same language as the story.

## Drawing instructions
- In each scene description, describe only what is visible. Name every character in frame; put each speaker on the side given in their balloon.
- In the character list, describe identity only (no clothes). If the cast list is given, use it as authoritative.`;

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

/** Pass 1: the writer. */
export async function writeScript(story: string, style: ComicStyle, cast?: CastMember[]): Promise<ComicScript> {
  const castNotes =
    cast === undefined
      ? ""
      : `\n\n<cast_bible>\n${JSON.stringify(
          cast.map((member) => ({
            name: member.name,
            role: member.role,
            importance: member.importance,
            identity: member.identity ?? member.description,
            main_stage: member.mainStage ? { id: "main", ...member.mainStage } : { id: "main" },
            other_stages: (member.stages ?? []).map(({ id, label, ageRange }) => ({ id, label, ageRange })),
            wardrobe_notes: member.wardrobe ?? "",
          })),
          null,
          1,
        )}\n</cast_bible>\nThis cast is authoritative. Use their names exactly (including punctuation) in the character list, cover scene, panel scenes, scene context and speakers. Respect their identity; do not invent replacement looks or bring back removed named characters. Extra unnamed background people are fine. In every scene, name each cast member visible in frame, and choose their stage and wardrobe in the scene context.`;
  const draft = await askClaude({
    system: WRITER_PROMPT,
    user: `Art style: ${style.label} — ${style.blurb}.\nHow this style tells stories: ${style.storytelling}\n\n<story>\n${story}\n</story>${castNotes}`,
    schema: ScriptSchema,
    effort: "high",
  });

  const pages: Page[] = draft.pages
    .filter((page) => page.panels.length > 0)
    .slice(0, MAX_PAGES)
    .map((page) => {
      const panels = page.panels.slice(0, 6).map((panel) => ({
        ...panel,
        dialogue: panel.dialogue.slice(0, 3),
        // "main" means the character's main age; stored as "".
        context: { ...panel.context, cast: panel.context.cast.map((person) => ({ ...person, stage: person.stage === "main" ? "" : person.stage })) },
      }));
      return { layout: fitLayout(page.layout, panels.length), panels };
    });
  if (pages.length === 0) {
    throw new UserFacingError("The comic script came back empty. Please try again.", 502);
  }

  return {
    title: draft.title,
    tagline: draft.tagline,
    bible: draft.bible,
    characters: cast === undefined ? draft.characters : [
      ...cast.map((member) => ({ name: member.name, appearance: member.description })),
      ...draft.characters.filter((character) => !cast.some((member) => member.name.normalize("NFKC").toLowerCase() === character.name.normalize("NFKC").toLowerCase())),
    ],
    cover: draft.cover,
    pages,
  };
}

/** Pass 2: the editor. Only captions, balloons, title and tagline change; the art plan stays the same. */
export async function polishScript(story: string, script: ComicScript): Promise<ComicScript> {
  const edit = await askClaude({
    system: EDITOR_PROMPT,
    user: `<original_story>\n${story}\n</original_story>\n\n<script>\n${JSON.stringify(script, null, 1)}\n</script>`,
    schema: EditSchema,
    effort: "medium",
  });

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
