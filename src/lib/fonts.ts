import { Bangers, Comic_Neue } from "next/font/google";

export const titleFont = Bangers({ weight: "400", subsets: ["latin"], variable: "--font-title" });
export const comicFont = Comic_Neue({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-comic" });

/** Font families handed to the canvas renderer so bubbles look the same on screen and in downloads. */
export const renderFonts = {
  title: titleFont.style.fontFamily,
  text: comicFont.style.fontFamily,
};
