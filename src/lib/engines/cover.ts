import "server-only";
import { z } from "zod";
import { askClaude } from "../claude";
import { COVER_FONTS, type CastMember, type ComicScript } from "../comic";
import type { ComicStyle } from "../styles";

// Cover Art Director: designs one cover per comic, built around what this particular story
// is about, instead of a generic "characters standing together" picture.

const HEX = /^#[0-9a-fA-F]{6}$/;

const CoverSchema = z.object({
  concept: z
    .string()
    .describe("One or two sentences: the big idea of the cover and why it captures this story's heart"),
  approach: z.enum([
    "iconic-hero",
    "symbolic",
    "dramatic-moment",
    "portrait-montage",
    "scale-and-setting",
    "intimate-closeup",
    "split-time",
  ]),
  scene: z
    .string()
    .describe(
      "Detailed brief for the cover artist: focal image, who is in it (by name) and their pose and expression, camera angle and lens, setting, lighting, colour palette, mood, and symbolic details. 80-150 words.",
    ),
  titleFont: z.enum(COVER_FONTS),
  titleFill: z.string().describe("Title fill colour as #RRGGBB, picked from the cover's palette"),
  titleOutline: z.string().describe("Title outline colour as #RRGGBB, contrasting with the fill"),
  titlePosition: z.enum(["top", "bottom"]).describe("Where the title sits; the artwork leaves calm space there"),
});

const COVER_PROMPT = `You are the cover art director at Comic.me. Every comic we make is someone's real story, printed as a book. The cover is what makes them gasp when they first see it, so it must look like a work of art by a top comic-cover artist, not a generic illustration.

Great comic covers:
- Have ONE striking focal image with a strong silhouette, readable at thumbnail size.
- Sell the story's emotional core or its promise, not a literal summary of events. Often the best cover is a symbol, a moment just before something changes, or the hero framed by what they're up against.
- Use dramatic composition: bold perspective (low or high angle), scale contrast (a small figure against a vast setting, or a huge face looming over a scene), strong diagonals, depth.
- Use cinematic lighting (rim light, backlight, golden hour, neon, chiaroscuro) and a limited, bold colour palette with one accent colour.
- Leave calm space for the title, at the top or bottom.

Choose an approach that fits THIS story and its tone:
- iconic-hero: the main character in a heroic, defining pose (careers, achievements, comebacks).
- symbolic: an object or image that stands for the story (a ring in a samosa box, a rickshaw key, a seed jar).
- dramatic-moment: the turning point frozen at its most charged instant.
- portrait-montage: the main faces arranged large, with key moments woven into the background (family sagas, love stories).
- scale-and-setting: small figures against a vast, meaningful place (journeys, migrations, cities).
- intimate-closeup: a tender, emotional close-up (romance, quiet family stories).
- split-time: past and present in one image (then-and-now stories).

Title lettering (fonts): bangers = superhero/fun pop energy; bebas = cinematic, modern, thriller, noir; playfair = romance, literary, elegant; marker = playful, indie, teen, handmade; abril = retro, vintage, classic family; cinzel = epic, historical, mythic, legendary. Pick colours from the cover's palette: the title must stay readable over the art.

Write the scene brief for an illustrator working in the comic's art style. Name the characters who appear (their looks are known to the artist). Avoid clichés unless you make them fresh. Do not ask for any text or lettering in the art.`;

export async function designCover(script: ComicScript, story: string, style: ComicStyle, cast?: CastMember[]) {
  const people = (cast ?? []).map((member) => `- ${member.name} (${member.importance}): ${member.role}`).join("\n") ||
    script.characters.map((character) => `- ${character.name}`).join("\n");
  const outline = script.pages
    .map((page, p) => `Page ${p + 1}: ${page.panels.map((panel) => panel.caption || panel.scene).join(" / ")}`)
    .join("\n")
    .slice(0, 6000);

  const cover = await askClaude({
    system: COVER_PROMPT,
    user: `Art style: ${style.label}. ${style.art}\nStorytelling sensibility: ${style.storytelling}\n\nTitle: ${script.title}\nTagline: ${script.tagline}\nLogline: ${script.bible?.logline ?? ""}\nTone: ${script.bible?.tone ?? ""}\nArc: ${script.bible?.arc ?? ""}\n\nPeople:\n${people}\n\n<page_outline>\n${outline}\n</page_outline>\n\n<original_story>\n${story.slice(0, 4000)}\n</original_story>`,
    schema: CoverSchema,
    effort: "medium",
    maxTokens: 16000,
  });

  return {
    scene: cover.scene,
    design: {
      concept: cover.concept,
      titleFont: cover.titleFont,
      titleFill: HEX.test(cover.titleFill) ? cover.titleFill : "#facc15",
      titleOutline: HEX.test(cover.titleOutline) ? cover.titleOutline : "#111111",
      titlePosition: cover.titlePosition,
    },
  };
}
