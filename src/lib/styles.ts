// The comic styles a user can pick. `art` is the art direction sent to the
// image model for every panel, so all six panels share one look.

export type ComicStyle = {
  id: string;
  label: string;
  blurb: string;
  emoji: string;
  art: string;
};

export const COMIC_STYLES: ComicStyle[] = [
  {
    id: "superhero",
    label: "Classic Superhero",
    blurb: "Bold ink, punchy colours, big drama",
    emoji: "💥",
    art: "Classic American superhero comic book art: bold confident ink outlines, dynamic angles, dramatic lighting, saturated primary colours with subtle halftone shading.",
  },
  {
    id: "manga",
    label: "Manga",
    blurb: "Expressive faces, crisp black & white",
    emoji: "🌸",
    art: "Japanese manga style: clean expressive line art, large expressive eyes, screentone shading, black and white with grey tones, cinematic framing.",
  },
  {
    id: "newspaper",
    label: "Sunday Strip",
    blurb: "Warm, retro newspaper funnies",
    emoji: "📰",
    art: "Retro Sunday newspaper comic strip style: simple rounded characters, warm muted colours on slightly yellowed paper, visible Ben-Day dots, gentle humour.",
  },
  {
    id: "cartoon",
    label: "Modern Cartoon",
    blurb: "Bright, friendly, animated-film feel",
    emoji: "🎈",
    art: "Modern animated cartoon style: friendly rounded shapes, bright cheerful colours, soft cel shading, clean thick outlines, expressive poses.",
  },
  {
    id: "noir",
    label: "Noir",
    blurb: "Moody shadows, high contrast",
    emoji: "🕵️",
    art: "Graphic noir comic style: high-contrast black and white with deep shadows, a single accent colour of muted red, heavy brush ink, moody cinematic lighting.",
  },
  {
    id: "watercolor",
    label: "Watercolour Storybook",
    blurb: "Soft, dreamy, heartfelt",
    emoji: "🎨",
    art: "Soft watercolour storybook illustration: delicate pencil linework, gentle washes of pastel colour, textured paper, warm nostalgic light.",
  },
];

export function getStyle(id: string): ComicStyle | undefined {
  return COMIC_STYLES.find((style) => style.id === id);
}
