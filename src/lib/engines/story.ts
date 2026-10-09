import "server-only";
import { z } from "zod";
import { BALLOON_KINDS, COMPLEXITIES, identityOnly, MAX_PAGES, MAX_PANELS, maxHeroPanels, sheetOutfit, type CanonObject, type CastMember, type ComicScript, type Page, type RemixPreset } from "../comic";
import { askClaude } from "../claude";
import { UserFacingError } from "../errors";
import { fitLayout, LAYOUT_IDS, layoutMenu } from "../layouts";
import type { ComicStyle } from "../styles";

// Story Engine: turns the user's story into a multi-page comic script using Claude, in two passes:
//   1. The Comic Director builds a story bible, interprets the story in the chosen style, plans
//      pages, and writes every panel WITH its structured scene context (who, which age, what they
//      wear, where, when, mood, props, continuity), so pictures are built from facts.
//   2. The dialogue writer rewrites every caption and balloon with each person's voice, the
//      relationship, their age, the scene, the tone and the style's dialogue direction (less text,
//      more subtext), and offers alternative titles.

// Claude compiles the output schema into a grammar with a hard size limit ("The compiled grammar is
// too large"). This schema sits close to it: before adding a field, run .context/probe-grammar.ts or
// fold the information into an existing field (as hero, inside and voice do).
export const DialogueSchema = z.object({
  speaker: z.string().describe("Character name, exactly as in the character list"),
  side: z.enum(["left", "right"]).describe("Which side of the panel the speaker stands on"),
  kind: z
    .enum(BALLOON_KINDS)
    .describe("Balloon type: speech; shout (yelling, excitement); whisper (quiet aside); thought (unspoken); robot (machines, AIs, monsters, announcements)"),
  text: z.string().describe("Balloon text, usually under 12 words, at most 20. Wrap one or two stressed words in *asterisks* for emphasis, sparingly."),
});

export const LetteringSchema = z.object({
  caption: z.string().describe("Narrator caption, at most 25 words. Empty string if none."),
  dialogue: z.array(DialogueSchema).describe("0 to 3 balloons, in reading order"),
  sfx: z.string().describe('A sound effect lettered over the art, e.g. "KRAK!", "VROOM", "tik… tik…". Empty string for most panels.'),
});

export const ContextSchema = z.object({
  location: z.string().describe("Specific place; reuse the exact same wording for every panel in the same place"),
  period: z.string().describe('Year or era, e.g. "2016", "summer 1958", "college years"'),
  timeOfDay: z.string(),
  weather: z.string().describe('e.g. "monsoon rain", "clear winter night", "indoors"'),
  event: z.string().describe('What occasion this is, e.g. "college fest", "wedding reception", "ordinary school morning"'),
  activity: z.string().describe('What is happening, e.g. "cramming for board exams", "first dance", "pitching investors"'),
  camera: z.string().describe('Camera angle and lens, e.g. "low angle, wide lens", "over-the-shoulder, long lens", "top-down"'),
  relationships: z.string().describe('Who these people are to each other in this moment, e.g. "proud father, anxious son"; empty if one person'),
  cast: z
    .array(
      z.object({
        name: z.string().describe("Exact cast name"),
        stage: z.string().describe('Life stage id from the cast list, or "main" for their main age'),
        wardrobe: z.string().describe("What they wear in THIS scene, fitting age, era, place, activity, event, weather and culture"),
        emotion: z.string(),
        action: z.string().describe("What they are doing / their pose"),
        inside: z.string().describe('If they are in or on a canon object: "<object id>: <where>", e.g. "huracan: driver\'s seat", "gt-r: leaning out of the passenger window"; empty if none'),
        lookChange: z.string().describe('Only for look_policy "ask": a big look change this scene needs (e.g. "red wedding lehenga"); empty otherwise'),
      }),
    )
    .describe("Everyone visible in the panel, including anyone visible inside a vehicle (even a silhouette)"),
  objects: z.array(z.string()).describe("Incidental props that matter in this panel (not canon objects)"),
  canon: z
    .array(z.object({ id: z.string().describe("Object Bible id"), state: z.string().describe("A defined state id, or empty for as designed"), position: z.string().describe("Where it is in the frame") }))
    .describe("EVERY canon object visible in this panel, even tiny, distant or in a mirror"),
  sequence: z.string().describe('Action-sequence id shared by consecutive panels of one continuous action (e.g. "signal-race"); empty if none'),
  motion: z
    .object({
      direction: z.enum(["left-to-right", "right-to-left", "toward-camera", "away-from-camera", "static"]).describe("Travel direction across the frame"),
      order: z.string().describe('Who is ahead/behind/left/right, e.g. "GT-R a nose ahead; Huracan on its right"'),
      cameraSide: z.string().describe('Which side of the action the camera is on, e.g. "outside of the bend"'),
    })
    .describe("Screen direction; static when nothing travels"),
  transition: z.string().describe("Explicit time jump or life-stage change; empty for a continuous scene"),
  axisChange: z.boolean().describe("True only if this panel deliberately crosses the action line (explain it in the scene)"),
  continuity: z.string().describe("What must match the previous panel (same clothes in the same scene, props in hand, mess, light); empty if a new scene"),
});

export const ScriptSchema = z.object({
  bible: z.object({
    logline: z.string().describe("One sentence: whose story this is and what it's really about"),
    tone: z.string(),
    arc: z.string().describe("The emotional journey from first page to last, in 2-3 sentences"),
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
      voice: z.string().describe("How this person talks: rhythm, words, humour. Empty if they never speak."),
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
          complexity: z.enum(COMPLEXITIES).describe("How hard this is to draw correctly: several vehicles + visible drivers + extreme perspective + smoke/crowds = high or very_high"),
          safeShot: z.string().describe("A simpler composition of the SAME beat that is easy to draw correctly (used if the ambitious one fails)"),
          hero: z.string().describe('Empty for almost every panel. Only for the book\'s 1-2 jaw-dropping hero panels: the narrative reason (e.g. "the reveal", "biggest joke")'),
        }),
      ),
    }),
  ),
});

export const EditSchema = z.object({
  title: z.string(),
  titleAlternatives: z.array(z.string()).describe("2-3 other strong titles for this comic, different in angle (max 6 words each)"),
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
5. **Hero panels.** Pick the book's 1-2 jaw-dropping moments (3 at most for 10+ pages) and put the narrative reason in hero (leave hero empty for every other panel). Choose them for narrative weight: a transformation, reveal, victory, defeat, first kiss, dramatic entrance, emotional peak, discovery, action climax, the biggest joke, a reunion or a major decision. Never pick a panel just because it comes first. Give each hero panel a big frame (a splash, or the big panel of its layout), an ambitious camera and a richly described scene: these are where the reader should stop and stare.
6. **Panels.** For each panel: a shot, a vivid scene description, its scene context, and the caption and balloons.

## Scene context (filled in for every panel)
- Track time precisely. When the story jumps in time, everyone's age changes: pick each person's life stage from the cast list ("main" or a stage id) so children look like children and the old look old.
- Wardrobe comes from the scene, never from habit: age, era, place, activity, event, weather and culture decide what people wear (school uniform at school, casual at college, festive or wedding clothes at a wedding, workwear at work, sportswear on court, layers in winter). Within one continuous scene, clothes stay the same; a new day or occasion means new clothes.
- Reuse the exact same location wording for panels in the same place, and note continuity (props in hand, spilled tea, rain-soaked clothes) from the previous panel.
- Fill in the activity, the camera (angle and lens, chosen in this style's camera language) and the relationships in frame, so every picture is built from the same facts instead of being reinvented panel by panel.
- Identity never changes: a person keeps their face, skin, hair identity and distinctive markers in every panel, at every age and in every outfit.

## Continuity (each panel is drawn separately, so spell out the state)
- **Object Bible.** Recurring important things (the hero's car, a rival's car, an heirloom) have ids, descriptions and LOCKED attributes. Whenever one is visible, even tiny, in the background or in a mirror, list it in canon. Describe it consistently with its locks and never contradict them; a state change (damage) only if the story causes it, using a defined state.
- **Occupants.** Anyone in or on a vehicle gets inside ("<object id>: <where>", e.g. "huracan: driver's seat"), and must be listed in cast even if only a silhouette is visible. A vehicle's owner drives it unless the story says otherwise. Respect the driver side.
- **Action sequences.** Plan the spatial progression of an action sequence before writing its panels (approach → side by side → overtakes → exits ahead). Give its panels the same sequence id. motion.direction is the travel direction across the frame: keep it constant within a sequence (180-degree rule) unless axisChange is true and the scene shows why. motion.order says exactly who is ahead, behind, left and right; it must follow the story (if he's a nose ahead, he's a nose ahead).
- **Vehicle physics.** In a moving car (rolling, fast, racing, drifting, chasing) the driver faces the direction of travel with both hands on the wheel, torso inside, eyes on the road; a look back happens through the mirror or over the shoulder. Leaning out of a window, waving or looking at the camera only happens when the car is parked, stopped or crawling: write the car stopped in that panel, or show the attitude from inside the cabin. Tyre smoke, flames and speed lines trail behind. For every vehicle panel the camera states where it is (front, rear, side, three-quarter), its height and distance; keep the camera on one side of the action line within a scene.
- **No accidental extras.** Each named character appears at most once per panel. No extra vehicles or people in action scenes beyond those the story has.
- **Complexity.** Rate every panel. Several vehicles + visible drivers + extreme perspective + smoke, crowds or reflections is high or very_high. Keep very_high for hero panels; otherwise prefer the composition that keeps the beat readable. Always write a safeShot: the same beat as a simple, clear composition (e.g. a clean rear three-quarter view of both cars with obvious road geometry and drivers not exposed).
- **Look policies.** look_policy "keep": wardrobe is exactly "approved outfit" (their design-sheet outfit for that life stage). "story": dress them for the scene. "ask": wardrobe "approved outfit", but if the story genuinely needs a big change (wedding clothes, a uniform, a costume), describe it in lookChange.

## Writing that makes sense to a stranger
- Write for a reader who doesn't know these people. Every page must make sense on its own and in sequence.
- Captions establish context: when and where we are, what changed, time jumps ("Two years later, Toronto."), and why the moment matters.
- Dialogue never narrates what the picture already shows. Not "We have arrived at college." Not "I am surprised." Characters talk the way real people do: with personality, humour, subtext, conflict and their relationship in every line.
- Each person sounds like themselves (see each character's voice): a child sounds like a child, a stern father like a stern father. They must not all sound like the same narrator.
- Make lines specific to this story, not generic: not "You did it!" but "You actually got the Toronto job!"
- Introduce each person by name early, in a caption or dialogue.
- Less is more: great comics use few words. Captions at most 25 words, balloons usually under 12 words (never over 20), at most 3 balloons per panel. Let some panels be silent.
- Use balloon kinds: "shout" for yelling or excitement, "whisper" for quiet asides, "thought" for unspoken feelings, "robot" for machines, AIs, monsters and announcements. Mark one stressed word with *asterisks* now and then.
- Sound effects (sfx) only where this style and moment want them (an engine, a slammed door, a crowd roar), most often in playful or action styles. Most panels have none.

## Truthfulness and originality
- For real memories, stay true to the facts, names, places and order of events; you may dramatise small connecting moments and invent natural dialogue, but never invent major life events. For ideas and fantasies, build freely in their spirit.
- Never use recognisable copyrighted characters, creatures, logos or mascots; design originals (an original giant monster, not a famous one).
- Write in the same language as the story.

## Drawing instructions
- In each scene description, describe only what is visible. Name every character in frame; put each speaker on the side given in their balloon.
- In the character list, describe identity only (no clothes). If the cast list is given, use it as authoritative.`;

const EDITOR_PROMPT = `You are the dialogue writer and editor at Comic.me. A director has turned someone's real story into a comic script, with a story bible (logline, tone, arc, how each person talks) and scene context for every panel (who is there, their age, emotion, activity, relationships). Your job: make every caption and balloon sing for a first-time reader, in this comic's style.

For every line, know: who is speaking (their personality and voice from the bible), who they're speaking to (the relationship in this moment), their age at this point in the story, the scene and activity, their emotion, the story's tone and the style's dialogue direction below.

Rewrite where it helps:
- Cut dialogue that narrates what we can already see ("We're here!", "I'm so happy."). Replace it with what this person would actually say, or with silence.
- Give each person their own voice: rhythm, vocabulary, humour, what they avoid saying. A child sounds like a child; a stern father says less than he means.
- Use subtext and conflict: people tease, deflect, interrupt, understate. Specific beats generic.
- Use LESS text. Most balloons under 12 words. If a picture carries the moment, make the panel silent. Over-written comics feel like AI.
- Captions: only what the reader needs (when, where, what changed, why it matters), in a voice that suits the style.
- Balloon kinds: shout for yelling/excitement, whisper for asides, thought for the unspoken, robot for machines, AIs and monsters. Mark a stressed word with *asterisks* sparingly.
- Sound effects (sfx): keep or add one only where it makes the panel more fun or more physical; otherwise leave it empty.
- Do the ending and the page turns land? Does each hero panel get the line (or the silence) it deserves?

Rules:
- Keep the facts true to the original story.
- Return exactly the same number of pages, and the same number of panels on each page, in the same order.
- Each balloon's speaker must be someone in that panel's scene; keep each speaker's side.
- Polish the title and tagline, and offer 2-3 alternative titles with different angles (funny, poignant, bold).`;

/** Pass 1: the writer. */
export async function writeScript(story: string, style: ComicStyle, cast?: CastMember[], preset?: RemixPreset, objects: CanonObject[] = []): Promise<ComicScript> {
  // Recreate: borrow another comic's format (structure, pacing), never its content.
  const presetNotes = preset
    ? `\n\n<format_template>\nThe person chose to recreate the format of a comic they liked: reuse its creative recipe, never its content. Adapted to THIS story: about ${preset.pageCount} pages and ${preset.panelCount} panels, ${preset.pacing} pacing, page layouts in roughly this order: ${preset.layoutPattern.join(", ")}.${preset.heroCount ? ` ${preset.heroCount} hero panel(s), placed around ${(preset.heroPlacement ?? []).map((at) => `${Math.round(at * 100)}%`).join(" and ")} of the way through.` : ""}${preset.dialogue ? ` Dialogue treatment: ${preset.dialogue} (about ${Math.round((preset.silentShare ?? 0) * 100)}% silent panels${preset.sfxShare ? `, sound effects in about ${Math.round(preset.sfxShare * 100)}% of panels` : ""}).` : ""} Adjust where this story clearly needs it.\n</format_template>`
    : "";
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
            look_policy: member.lookPolicy ?? "story",
            approved_outfit: sheetOutfit(member.description) || undefined,
          })),
          null,
          1,
        )}\n</cast_bible>\nThis cast is authoritative. Use their names exactly (including punctuation) in the character list, cover scene, panel scenes, scene context and speakers. Respect their identity; do not invent replacement looks or bring back removed named characters. Extra unnamed background people are fine. In every scene, name each cast member visible in frame, and choose their stage and wardrobe in the scene context.`;
  const objectNotes = objects.length
    ? `\n\n<object_bible>\n${JSON.stringify(
        objects.map(({ id, name, kind, role, owner, description, locks, driverSide, states }) => ({ id, name, kind, role, owner, description, locks, driverSide, states })),
        null,
        1,
      )}\n</object_bible>\nThese objects are canon: list them in each panel's canon whenever visible and never contradict their locks.`
    : "";
  const draft = await askClaude({
    system: WRITER_PROMPT,
    user: `Art style: ${style.label} — ${style.blurb}.\nHow this style tells stories: ${style.storytelling}\n\n<story>\n${story}\n</story>${castNotes}${objectNotes}${presetNotes}`,
    schema: ScriptSchema,
    effort: "high",
    operation: "comic-director",
  });

  const pages: Page[] = draft.pages
    .filter((page) => page.panels.length > 0)
    .slice(0, MAX_PAGES)
    .map((page) => {
      const panels = page.panels.slice(0, 6).map((panel) => ({
        ...panel,
        dialogue: panel.dialogue.slice(0, 3),
        sfx: panel.sfx.trim() || undefined,
        hero: panel.hero.trim() ? true : undefined,
        heroReason: panel.hero.trim() || undefined,
        complexity: panel.complexity,
        safeShot: panel.safeShot.trim() || undefined,
        context: {
          ...panel.context,
          sequence: panel.context.sequence.trim() || undefined,
          transition: panel.context.transition.trim() || undefined,
  axisChange: panel.context.axisChange || undefined,
          canon: panel.context.canon.map((object) => ({ id: object.id, state: object.state.trim() || undefined, position: object.position.trim() || undefined })),
          // "main" means the character's main age; stored as "".
          cast: panel.context.cast.map(({ inside, lookChange, ...person }) => ({
            ...person,
            stage: person.stage === "main" ? "" : person.stage,
            inside: parseInside(inside),
            lookChange: lookChange.trim() || undefined,
          })),
        },
      }));
      return { layout: fitLayout(page.layout, panels.length), panels };
    });
  if (pages.length === 0) {
    throw new UserFacingError("The comic script came back empty. Please try again.", 502);
  }
  // Hero panels are where we spend extra: keep the first few the director chose.
  let heroes = 0;
  for (const panel of pages.flatMap((page) => page.panels)) {
    if (panel.hero && ++heroes > maxHeroPanels(pages.length)) {
      panel.hero = undefined;
      panel.heroReason = undefined;
    }
  }

  return {
    title: draft.title,
    tagline: draft.tagline,
    bible: { ...draft.bible, voices: draft.characters.filter((character) => character.voice.trim()).map(({ name, voice }) => ({ name, voice })) },
    characters: cast === undefined ? draft.characters.map(({ name, appearance }) => ({ name, appearance })) : [
      ...cast.map((member) => ({ name: member.name, appearance: identityOnly(member.description) })),
      ...draft.characters.filter((character) => !cast.some((member) => member.name.normalize("NFKC").toLowerCase() === character.name.normalize("NFKC").toLowerCase())).map(({ name, appearance }) => ({ name, appearance })),
    ],
    cover: draft.cover,
    pages,
  };
}

/** "huracan: driver's seat" → { objectId: "huracan", position: "driver's seat" }. */
function parseInside(value: string): { objectId: string; position: string } | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const [objectId, ...rest] = text.split(/\s*[:|]\s*/);
  return { objectId: objectId.trim(), position: rest.join(": ").trim() };
}

/** Pass 2: the editor. Only captions, balloons, title and tagline change; the art plan stays the same. */
export async function polishScript(story: string, script: ComicScript, style?: ComicStyle): Promise<ComicScript> {
  const edit = await askClaude({
    system: EDITOR_PROMPT,
    user: `${style ? `Style: ${style.label}. Dialogue direction for this style: ${style.direction.dialogue}\n\n` : ""}<original_story>\n${story}\n</original_story>\n\n<script>\n${JSON.stringify(script, null, 1)}\n</script>`,
    schema: EditSchema,
    effort: "medium",
    operation: "dialogue-editor",
  });

  return {
    ...script,
    title: edit.title.trim() || script.title,
    titleOptions: [...new Set([script.title, ...edit.titleAlternatives].map((title) => title.trim()).filter(Boolean))]
      .filter((title) => title !== (edit.title.trim() || script.title))
      .slice(0, 3),
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
          sfx: edited.panels[i].sfx.trim() || undefined,
        })),
      };
    }),
  };
}
