// The comic styles a user can pick.
// - `art` is the art direction sent to the image model for every panel, so the whole comic shares one look.
// - `storytelling` guides the writer's pacing and tone for this tradition.
// - `lettering` controls how our renderer draws captions, balloons and page gutters.
// Styles are described by technique and tradition, never by copying a specific artist.

export type LetteringFont = "comic" | "hand" | "typewriter";

export type Lettering = {
  pageColor: string;
  captionFill: string;
  captionInk: string;
  captionFont: LetteringFont;
  balloonFont: LetteringFont;
};

export type ComicStyle = {
  id: string;
  label: string;
  blurb: string;
  art: string;
  storytelling: string;
  lettering: Lettering;
};

const classicLettering: Lettering = {
  pageColor: "#ffffff",
  captionFill: "#fde68a",
  captionInk: "#111111",
  captionFont: "comic",
  balloonFont: "comic",
};

export const COMIC_STYLES: ComicStyle[] = [
  {
    id: "superhero",
    label: "Superhero",
    blurb: "Bold ink, big drama, heroic poses",
    art: [
      "Modern American superhero comic book art.",
      "Confident, varied-weight black ink outlines with feathered hatching in the shadows;",
      "dynamic foreshortening, low heroic camera angles and strong silhouettes;",
      "saturated primary-leaning colours with crisp cel shading, rim lighting and subtle halftone dot texture;",
      "anatomically grounded, expressive figures; everyday people drawn with the gravity of heroes.",
    ].join(" "),
    storytelling: "Treat ordinary milestones as epic feats. Punchy, confident lines; dramatic reveals at page ends.",
    lettering: classicLettering,
  },
  {
    id: "manga",
    label: "Manga",
    blurb: "Expressive faces, black & white tones",
    art: [
      "Japanese manga art, black and white only (no colour).",
      "Clean precise line art with tapered strokes; expressive faces with large detailed eyes;",
      "grey screentone shading and gradients; speed lines and focus lines for emotion and motion;",
      "detailed backgrounds for establishing shots, simplified backgrounds with sparkles or tone patterns for emotional close-ups;",
      "cinematic framing with dramatic close-ups.",
    ].join(" "),
    storytelling:
      "Linger on feelings: quiet reaction panels, inner thoughts, small silent beats before big emotions. Use thought balloons.",
    lettering: { ...classicLettering, captionFill: "#ffffff" },
  },
  {
    id: "ligne-claire",
    label: "Clear Line",
    blurb: "Classic European adventure albums",
    art: [
      "European 'ligne claire' (clear line) comic album style.",
      "Uniform-weight clean black outlines everywhere, no hatching;",
      "flat bright colours with almost no shading, realistic detailed backgrounds and vehicles,",
      "slightly simplified, cartoonish characters against those realistic settings;",
      "even daylight, clear readable staging, every panel composed like a postcard.",
    ].join(" "),
    storytelling: "Light adventure tone with gentle humour; clear cause-and-effect from panel to panel.",
    lettering: { ...classicLettering, captionFill: "#fef9c3" },
  },
  {
    id: "newspaper",
    label: "Sunday Strip",
    blurb: "Warm, retro newspaper funnies",
    art: [
      "Vintage Sunday newspaper comic strip.",
      "Simple rounded characters with big noses and expressive gestures; brush-ink outlines;",
      "limited warm palette printed on slightly yellowed newsprint with visible Ben-Day dots and slight colour misregistration;",
      "simple backgrounds, clear staging, gentle slapstick body language.",
    ].join(" "),
    storytelling: "Warm and funny. Each page should land a small gag or a sweet punchline.",
    lettering: { ...classicLettering, pageColor: "#fbf3df", captionFill: "#fef3c7" },
  },
  {
    id: "cartoon",
    label: "Modern Cartoon",
    blurb: "Bright, friendly, animated-film feel",
    art: [
      "Modern animated-film cartoon illustration.",
      "Friendly rounded shapes and appealing stylised proportions; clean thick outlines;",
      "bright cheerful colours with soft cel shading and gentle gradients; warm, glowing lighting;",
      "expressive poses and faces, lively but uncluttered backgrounds.",
    ].join(" "),
    storytelling: "Upbeat and heartfelt, with playful humour and expressive reactions.",
    lettering: classicLettering,
  },
  {
    id: "graphic-novel",
    label: "Graphic Novel",
    blurb: "Painterly, grounded, literary",
    art: [
      "Contemporary literary graphic novel illustration.",
      "Loose confident ink lines with painterly digital colour and visible brush texture;",
      "muted, naturalistic palette with one warm accent colour per scene; soft natural light;",
      "grounded realistic proportions, subtle acting in faces and hands, atmospheric environments.",
    ].join(" "),
    storytelling: "Reflective and intimate. Let captions carry a thoughtful narrator voice; allow silent panels.",
    lettering: { ...classicLettering, captionFill: "#f5f0e6", captionFont: "hand", balloonFont: "hand" },
  },
  {
    id: "noir",
    label: "Noir",
    blurb: "Moody shadows, high contrast",
    art: [
      "Graphic noir comic art.",
      "Stark high-contrast black and white with large areas of solid black shadow;",
      "a single accent colour of deep muted red used sparingly; heavy brush ink, venetian-blind and streetlight lighting;",
      "rain, smoke and silhouettes; dramatic low and high camera angles.",
    ].join(" "),
    storytelling: "First-person, hard-boiled narrator captions with dry wit, even for happy stories.",
    lettering: {
      pageColor: "#0b0b0b",
      captionFill: "#111111",
      captionInk: "#f5f5f5",
      captionFont: "typewriter",
      balloonFont: "comic",
    },
  },
  {
    id: "watercolor",
    label: "Watercolour Storybook",
    blurb: "Soft, dreamy, heartfelt",
    art: [
      "Soft watercolour storybook illustration.",
      "Delicate pencil and fine-ink linework; translucent washes of pastel colour with soft blooms and bleeding edges;",
      "textured cold-press paper visible; warm nostalgic golden light; gentle, tender expressions;",
      "slightly simplified, charming characters.",
    ].join(" "),
    storytelling: "Tender and nostalgic, like a family storybook read aloud.",
    lettering: { ...classicLettering, pageColor: "#fffaf0", captionFill: "#fdf6e3", captionFont: "hand", balloonFont: "hand" },
  },
  {
    id: "desi-classic",
    label: "Desi Classic",
    blurb: "Vintage Indian illustrated comics",
    art: [
      "Vintage Indian illustrated comic book style from the 1970s-80s.",
      "Detailed realistic figure drawing with confident ink outlines; flat, rich printed colours (saffron, deep blue, maroon, leaf green)",
      "with subtle period printing texture; ornate clothing, jewellery and architectural detail;",
      "expressive faces and graceful classical poses; vivid Indian settings, from village to city.",
    ].join(" "),
    storytelling: "Storyteller narration with warmth and gravitas, as if retelling a family legend.",
    lettering: { ...classicLettering, captionFill: "#fde68a" },
  },
];

export function getStyle(id: string): ComicStyle | undefined {
  return COMIC_STYLES.find((style) => style.id === id);
}

export function styleSampleUrl(id: string): string {
  return `/styles/${id}.webp`;
}
