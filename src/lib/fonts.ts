import { Abril_Fatface, Bangers, Bebas_Neue, Cinzel, Comic_Neue, Patrick_Hand, Permanent_Marker, Playfair_Display, Special_Elite } from "next/font/google";
import type { RenderFonts } from "./engines/render";

export const titleFont = Bangers({ weight: "400", subsets: ["latin"], variable: "--font-title" });
export const comicFont = Comic_Neue({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-comic" });
const handFont = Patrick_Hand({ weight: "400", subsets: ["latin"], variable: "--font-hand" });
const typewriterFont = Special_Elite({ weight: "400", subsets: ["latin"], variable: "--font-typewriter" });

// Cover title typefaces (see COVER_FONTS).
const bebasFont = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-bebas" });
const playfairFont = Playfair_Display({ weight: ["900"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-playfair" });
const markerFont = Permanent_Marker({ weight: "400", subsets: ["latin"], variable: "--font-marker" });
const abrilFont = Abril_Fatface({ weight: "400", subsets: ["latin"], variable: "--font-abril" });
const cinzelFont = Cinzel({ weight: ["900"], subsets: ["latin"], variable: "--font-cinzel" });

export const fontVariables = [titleFont, comicFont, handFont, typewriterFont, bebasFont, playfairFont, markerFont, abrilFont, cinzelFont]
  .map((font) => font.variable)
  .join(" ");

/** Font families handed to the canvas renderer so lettering looks the same on screen and in downloads. */
export const renderFonts: RenderFonts = {
  title: titleFont.style.fontFamily,
  comic: comicFont.style.fontFamily,
  hand: handFont.style.fontFamily,
  typewriter: typewriterFont.style.fontFamily,
  cover: {
    bangers: titleFont.style.fontFamily,
    bebas: bebasFont.style.fontFamily,
    playfair: playfairFont.style.fontFamily,
    marker: markerFont.style.fontFamily,
    abril: abrilFont.style.fontFamily,
    cinzel: cinzelFont.style.fontFamily,
  },
};
