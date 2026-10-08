import {
  Abril_Fatface,
  Anton,
  Bangers,
  Bebas_Neue,
  Bodoni_Moda,
  Bungee,
  Caveat,
  Cinzel,
  Comic_Neue,
  Fraunces,
  Monoton,
  Patrick_Hand,
  Permanent_Marker,
  Playfair_Display,
  Shrikhand,
  Space_Grotesk,
  Special_Elite,
  Unbounded,
} from "next/font/google";
import type { CoverFont } from "./comic";
import type { RenderFonts } from "./engines/render";

export const titleFont = Bangers({ weight: "400", subsets: ["latin"], variable: "--font-title" });
export const comicFont = Comic_Neue({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-comic" });
const handFont = Patrick_Hand({ weight: "400", subsets: ["latin"], variable: "--font-hand" });
const typewriterFont = Special_Elite({ weight: "400", subsets: ["latin"], variable: "--font-typewriter" });

// Cover title typefaces (see COVER_FONTS): each one suits a different kind of story.
const bebasFont = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const antonFont = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const playfairFont = Playfair_Display({ weight: ["900"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-playfair" });
const bodoniFont = Bodoni_Moda({ weight: ["900"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-bodoni" });
const frauncesFont = Fraunces({ weight: ["900"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-fraunces" });
const markerFont = Permanent_Marker({ weight: "400", subsets: ["latin"], variable: "--font-marker" });
const caveatFont = Caveat({ weight: ["700"], subsets: ["latin"], variable: "--font-caveat" });
const abrilFont = Abril_Fatface({ weight: "400", subsets: ["latin"], variable: "--font-abril" });
const shrikhandFont = Shrikhand({ weight: "400", subsets: ["latin"], variable: "--font-shrikhand" });
const cinzelFont = Cinzel({ weight: ["900"], subsets: ["latin"], variable: "--font-cinzel" });
const bungeeFont = Bungee({ weight: "400", subsets: ["latin"], variable: "--font-bungee" });
const monotonFont = Monoton({ weight: "400", subsets: ["latin"], variable: "--font-monoton" });
const groteskFont = Space_Grotesk({ weight: ["700"], subsets: ["latin"], variable: "--font-grotesk" });
const unboundedFont = Unbounded({ weight: ["900"], subsets: ["latin"], variable: "--font-unbounded" });

const coverFonts: Record<CoverFont, { style: { fontFamily: string }; variable: string }> = {
  bangers: titleFont,
  bebas: bebasFont,
  anton: antonFont,
  playfair: playfairFont,
  bodoni: bodoniFont,
  fraunces: frauncesFont,
  marker: markerFont,
  caveat: caveatFont,
  abril: abrilFont,
  shrikhand: shrikhandFont,
  cinzel: cinzelFont,
  bungee: bungeeFont,
  monoton: monotonFont,
  grotesk: groteskFont,
  unbounded: unboundedFont,
};

export const fontVariables = [titleFont, comicFont, handFont, typewriterFont, ...Object.values(coverFonts).filter((font) => font !== titleFont)]
  .map((font) => font.variable)
  .join(" ");

/** Font families handed to the canvas renderer so lettering looks the same on screen and in downloads. */
export const renderFonts: RenderFonts = {
  title: titleFont.style.fontFamily,
  comic: comicFont.style.fontFamily,
  hand: handFont.style.fontFamily,
  typewriter: typewriterFont.style.fontFamily,
  cover: Object.fromEntries(Object.entries(coverFonts).map(([id, font]) => [id, font.style.fontFamily])) as Record<CoverFont, string>,
};
