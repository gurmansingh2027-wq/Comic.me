import { Bangers, Comic_Neue, Patrick_Hand, Special_Elite } from "next/font/google";
import type { RenderFonts } from "./engines/render";

export const titleFont = Bangers({ weight: "400", subsets: ["latin"], variable: "--font-title" });
export const comicFont = Comic_Neue({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-comic" });
const handFont = Patrick_Hand({ weight: "400", subsets: ["latin"], variable: "--font-hand" });
const typewriterFont = Special_Elite({ weight: "400", subsets: ["latin"], variable: "--font-typewriter" });

export const fontVariables = [titleFont, comicFont, handFont, typewriterFont].map((font) => font.variable).join(" ");

/** Font families handed to the canvas renderer so lettering looks the same on screen and in downloads. */
export const renderFonts: RenderFonts = {
  title: titleFont.style.fontFamily,
  comic: comicFont.style.fontFamily,
  hand: handFont.style.fontFamily,
  typewriter: typewriterFont.style.fontFamily,
};
