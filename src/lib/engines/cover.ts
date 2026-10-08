import "server-only";
import { z } from "zod";
import { askClaude } from "../claude";
import { COVER_FONTS, TITLE_SIZES, TITLE_TREATMENTS, type CastMember, type ComicScript, type CoverDesign, type RemixPreset } from "../comic";
import { COVER_FONT_GUIDE } from "../cover-fonts";
import type { ComicStyle } from "../styles";

// Cover Art Director: designs the cover around what THIS story is about. It brainstorms across
// many composition families, keeps the three strongest (different) ideas, and art-directs the
// title treatment for each one. The title is lettered by our code, never painted by the model.

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Composition families: covers should not all be "character + background + title". */
export const COVER_FAMILIES = {
  "extreme-closeup": "an extreme close-up (eyes, hands, an object) that fills the frame",
  "graphic-minimal": "a graphic, minimal design: flat shapes, a limited palette and lots of negative space, the figure off-centre",
  "symbolic-object": "one symbolic object that stands for the whole story",
  "negative-space": "a small subject in a huge calm field of colour or paper",
  "tiny-figure-giant-world": "a tiny figure against a vast, meaningful place",
  split: "a split composition: two halves, two times or two worlds",
  silhouette: "a bold silhouette against light or colour",
  collage: "a collage of moments, cut-outs and textures",
  "surreal-metaphor": "a surreal visual metaphor for the story's feeling",
  "geometric-abstract": "abstract geometric shapes and colour bands framing a figure",
  "action-freeze": "a dramatic action frozen at its peak",
  ensemble: "the cast arranged with real design intent (not a line-up)",
  "environmental-story": "a place full of clues that tells the story by itself",
  "intimate-moment": "a quiet, intimate moment between people",
  "editorial-design": "an editorial magazine-cover design: type and image working together",
  "classic-dramatic": "a classic dramatic comic cover: heroic figure, perspective, energy",
} as const;
type Family = keyof typeof COVER_FAMILIES;
const FAMILY_IDS = Object.keys(COVER_FAMILIES) as [Family, ...Family[]];

const ConceptSchema = z.object({
  concept: z.string().describe("One or two sentences: the big idea and why it captures THIS story's heart"),
  approach: z.enum(FAMILY_IDS).describe("The composition family"),
  scene: z
    .string()
    .describe(
      "Brief for the cover artist, 80-150 words: focal image, who is in it (by name) and their pose and expression, where they sit in the frame, camera angle and lens, setting, light, palette, graphic shapes, and exactly where the calm space for the title is.",
    ),
  titleFont: z.enum(COVER_FONTS),
  titleSize: z.enum(TITLE_SIZES).describe("Not always huge: small and confident is often classier"),
  titlePosition: z.enum(["top", "middle", "bottom"]),
  titleAlign: z.enum(["left", "center", "right"]),
  titleCase: z.enum(["upper", "as-written"]),
  titleTracking: z.number().describe("Letter spacing in em: -0.03 tight and punchy … 0.3 airy and elegant"),
  titleTreatment: z
    .enum(TITLE_TREATMENTS)
    .describe("solid = clean fill; outline = classic comic outline; shadow = soft drop shadow; band = text on a colour band; hollow = outline-only letters; stacked = one big word per line"),
  titleFill: z.string().describe("Title colour as #RRGGBB, from the cover's palette"),
  titleOutline: z.string().describe("Outline colour as #RRGGBB (used by outline/hollow treatments)"),
  titleBand: z.string().describe("Band colour as #RRGGBB (used by the band treatment)"),
  titleRotation: z.number().describe("Tilt in degrees, -8 to 8. 0 for most covers; a little for playful ones"),
});

const CoverSchema = z.object({
  genre: z.string().describe("What kind of story this is: sports, romance, comedy, horror, startup, travel, childhood, superhero, family saga…"),
  brainstorm: z
    .array(z.string())
    .describe("6 one-line cover ideas from 6 DIFFERENT composition families, before choosing. Wild ideas welcome."),
  options: z.array(ConceptSchema).describe("The 3 strongest ideas from the brainstorm, best first, each a different composition family"),
});

const COVER_PROMPT = `You are the cover art director at Comic.me. Every comic we make is someone's real story, printed as a book. The cover should make them think: "someone designed this specifically for MY story", never "the same poster template with different characters".

Think like a great cover designer, not an illustrator filling a rectangle:
- A great cover often contains LESS information, not more. One idea, ruthlessly clear, readable as a thumbnail.
- Illustration and graphic design work together: flat shapes, colour bands, negative space and the title are part of the composition.
- The main character does NOT have to stand in the centre. Off-centre figures, crops, silhouettes, a tiny figure in a vast space, a single object, a hand: all are stronger than a centred pose.
- Sell the story's emotional core or its promise, not a summary of events. A symbol, the moment before something changes, a visual joke.
- Avoid the generic: no "characters standing together smiling", no "hero in the middle with the title on top" unless it's genuinely the best idea for this story.

Let the story decide the family:
- superhero/action → dynamic splash composition or action freeze
- romance → an intimate moment or a symbolic visual
- comedy → a visual gag that makes you laugh before you open it
- sports → movement, tension, the peak of the action
- horror → negative space and unease
- startup/career → a clever metaphor
- travel → location and journey
- childhood → nostalgic visual language

Composition families:
${Object.entries(COVER_FAMILIES)
  .map(([id, text]) => `- ${id}: ${text}`)
  .join("\n")}

Process: brainstorm 6 ideas from 6 different families, then keep the 3 strongest (each a different family), best first. The person picks one.

Title treatment (our code letters it on top of the art; the artist leaves calm space):
- Fonts: ${COVER_FONT_GUIDE}
- Respond to story, genre, art style, era, humour and emotional tone. Don't default to a giant serif or a giant comic font.
- Size: huge only when the title IS the design; large for bold covers; medium or small for graphic, editorial, literary or quiet covers.
- Position and alignment follow the composition: put the title where the art leaves calm space (top/middle/bottom, left/centre/right).
- Colours come from the cover palette and must stay readable.

Write each scene brief for an illustrator working in the comic's art style. Name the characters who appear (their looks are known to the artist). Say where the calm title space is. Do not ask for any text or lettering in the art. Never use copyrighted characters or logos.`;

type Concept = z.infer<typeof ConceptSchema>;

const hex = (value: string, fallback: string) => (HEX.test(value) ? value : fallback);

function toCover(concept: Concept): { scene: string; design: CoverDesign } {
  return {
    scene: concept.scene,
    design: {
      concept: concept.concept,
      approach: concept.approach,
      titleFont: concept.titleFont,
      titleFill: hex(concept.titleFill, "#facc15"),
      titleOutline: hex(concept.titleOutline, "#111111"),
      titlePosition: concept.titlePosition,
      titleSize: concept.titleSize,
      titleAlign: concept.titleAlign,
      titleCase: concept.titleCase,
      titleTracking: Math.min(Math.max(concept.titleTracking, -0.05), 0.4),
      titleTreatment: concept.titleTreatment,
      titleBand: hex(concept.titleBand, "#111111"),
      titleRotation: Math.min(Math.max(concept.titleRotation, -8), 8),
    },
  };
}

/** Composition guidance for the artist, per family (older approach names map to the closest family). */
export function familyGuidance(approach: string | undefined): string {
  const legacy: Record<string, Family> = {
    "iconic-hero": "classic-dramatic",
    symbolic: "symbolic-object",
    "dramatic-moment": "action-freeze",
    "portrait-montage": "collage",
    "scale-and-setting": "tiny-figure-giant-world",
    "intimate-closeup": "intimate-moment",
    "split-time": "split",
  };
  const family = (approach && (approach in COVER_FAMILIES ? (approach as Family) : legacy[approach])) || undefined;
  return family ? COVER_FAMILIES[family] : "one striking focal image";
}

export async function designCover(script: ComicScript, story: string, style: ComicStyle, cast?: CastMember[], preset?: RemixPreset) {
  const people = (cast ?? []).map((member) => `- ${member.name} (${member.importance}): ${member.role}`).join("\n") ||
    script.characters.map((character) => `- ${character.name}`).join("\n");
  const outline = script.pages
    .map((page, p) => `Page ${p + 1}: ${page.panels.map((panel) => panel.caption || panel.scene).join(" / ")}`)
    .join("\n")
    .slice(0, 6000);

  const cover = await askClaude({
    system: COVER_PROMPT,
    user: `Art style: ${style.label}. ${style.art}\nHow this style tells stories and designs covers: ${style.storytelling}\n\nTitle: ${script.title}\nTagline: ${script.tagline}\nLogline: ${script.bible?.logline ?? ""}\nTone: ${script.bible?.tone ?? ""}\nArc: ${script.bible?.arc ?? ""}\n\nPeople:\n${people}\n\n<page_outline>\n${outline}\n</page_outline>\n\n<original_story>\n${story.slice(0, 4000)}\n</original_story>${preset?.coverApproach ? `\n\nThe person is recreating a comic whose cover used the "${preset.coverApproach}" composition${preset.coverTitleFont ? ` with ${preset.coverTitleFont} title lettering` : ""}. Make your FIRST idea use that family (for this story)${preset.coverTitle?.titleTreatment ? `, with a similar title treatment (${[preset.coverTitle.titleSize, preset.coverTitle.titleTreatment, preset.coverTitle.titleAlign && `${preset.coverTitle.titleAlign}-aligned`, preset.coverTitle.titlePosition && `at the ${preset.coverTitle.titlePosition}`].filter(Boolean).join(", ")})` : ""}, and the other two different.` : ""}`,
    schema: CoverSchema,
    effort: "medium",
    operation: "cover-art-director",
    maxTokens: 20000,
  });

  const options = cover.options.slice(0, 3).map(toCover);
  if (options.length === 0) throw new Error("The art director returned no cover ideas.");
  return { ...options[0], options };
}
