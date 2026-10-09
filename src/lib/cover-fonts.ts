import type { CoverFont } from "./comic";

// Cover title typefaces: the CSS variable for HTML previews (Explore, the title check) and the
// weight the canvas renderer uses. The fonts themselves are loaded in src/lib/fonts.ts.

export const COVER_FONT_CSS: Record<CoverFont, string> = {
  bangers: "var(--font-title)",
  bebas: "var(--font-bebas)",
  anton: "var(--font-anton)",
  playfair: "var(--font-playfair)",
  bodoni: "var(--font-bodoni)",
  fraunces: "var(--font-fraunces)",
  marker: "var(--font-marker)",
  caveat: "var(--font-caveat)",
  abril: "var(--font-abril)",
  shrikhand: "var(--font-shrikhand)",
  cinzel: "var(--font-cinzel)",
  bungee: "var(--font-bungee)",
  monoton: "var(--font-monoton)",
  grotesk: "var(--font-grotesk)",
  unbounded: "var(--font-unbounded)",
};

/** Weight to request for each family (variable fonts are loaded at their boldest cut). */
export const COVER_FONT_WEIGHT: Record<CoverFont, number> = {
  bangers: 400,
  bebas: 400,
  anton: 400,
  playfair: 900,
  bodoni: 900,
  fraunces: 900,
  marker: 400,
  caveat: 700,
  abril: 400,
  shrikhand: 400,
  cinzel: 900,
  bungee: 400,
  monoton: 400,
  grotesk: 700,
  unbounded: 900,
};

/** What each typeface is for, given to the cover art director. */
export const COVER_FONT_GUIDE = `bangers = loud pop superhero fun; bebas = cinematic condensed, thriller, modern; anton = heavy condensed poster, sports, action; playfair = romantic, literary, elegant; bodoni = fashion, editorial, high-contrast prestige; fraunces = warm soft serif, nostalgic, storybook, childhood; marker = handmade, indie, teen; caveat = handwritten, intimate diary, small moments; abril = retro, vintage, classic family; shrikhand = funky retro comedy, food, 70s; cinzel = epic, historical, mythic; bungee = street signage, urban, arcade; monoton = neon, retro sci-fi, nightlife; grotesk = clean modern, startup, minimal; unbounded = wide futuristic, tech, sci-fi.`;
