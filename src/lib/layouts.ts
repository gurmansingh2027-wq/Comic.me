// Page layouts, like a real comic book: each page is a 12×18 grid and every layout
// splits it into panels. Bigger panels slow the reader down for important moments;
// smaller panels speed things up. Shared by the writer (to choose), the artist
// (to pick each panel's shape) and the renderer (to draw the page).

export type Rect = { x: number; y: number; w: number; h: number };

export const GRID_COLS = 12;
export const GRID_ROWS = 18;

export const LAYOUT_IDS = [
  "splash",
  "two-tier",
  "big-top",
  "big-bottom",
  "three-tier",
  "tall-left",
  "grid-4",
  "wide-top-three",
  "sandwich",
  "five",
  "grid-6",
  "staggered-6",
] as const;

export type LayoutId = (typeof LAYOUT_IDS)[number];

type Layout = { description: string; panels: Rect[] };

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export const LAYOUTS: Record<LayoutId, Layout> = {
  splash: {
    description: "1 panel filling the whole page. For the single biggest moment or a dramatic reveal.",
    panels: [r(0, 0, 12, 18)],
  },
  "two-tier": {
    description: "2 wide panels stacked. Calm, cinematic; a before/after or setting + reaction.",
    panels: [r(0, 0, 12, 9), r(0, 9, 12, 9)],
  },
  "big-top": {
    description: "1 large panel on top, 2 small below. Establish a place or moment, then two beats.",
    panels: [r(0, 0, 12, 11), r(0, 11, 6, 7), r(6, 11, 6, 7)],
  },
  "big-bottom": {
    description: "2 small panels on top, 1 large below. Build-up that pays off in a big final image.",
    panels: [r(0, 0, 6, 7), r(6, 0, 6, 7), r(0, 7, 12, 11)],
  },
  "three-tier": {
    description: "3 wide strips. Travel, time passing, or a steady sequence.",
    panels: [r(0, 0, 12, 6), r(0, 6, 12, 6), r(0, 12, 12, 6)],
  },
  "tall-left": {
    description: "1 tall panel on the left (a full-height figure), 2 panels stacked on the right.",
    panels: [r(0, 0, 6, 18), r(6, 0, 6, 9), r(6, 9, 6, 9)],
  },
  "grid-4": {
    description: "4 equal panels. A balanced conversation or a short sequence.",
    panels: [r(0, 0, 6, 9), r(6, 0, 6, 9), r(0, 9, 6, 9), r(6, 9, 6, 9)],
  },
  "wide-top-three": {
    description: "1 wide establishing panel, then 3 narrow tall panels. Place, then quick beats.",
    panels: [r(0, 0, 12, 8), r(0, 8, 4, 10), r(4, 8, 4, 10), r(8, 8, 4, 10)],
  },
  sandwich: {
    description: "Wide strip, 2 panels side by side, wide strip. A small scene with a beginning and end.",
    panels: [r(0, 0, 12, 5), r(0, 5, 6, 8), r(6, 5, 6, 8), r(0, 13, 12, 5)],
  },
  five: {
    description: "2 panels, 1 wide middle panel, 2 panels. A busy scene with a central moment.",
    panels: [r(0, 0, 6, 6), r(6, 0, 6, 6), r(0, 6, 12, 6), r(0, 12, 6, 6), r(6, 12, 6, 6)],
  },
  "grid-6": {
    description: "6 equal panels. Fast dialogue or a montage of small moments.",
    panels: [r(0, 0, 6, 6), r(6, 0, 6, 6), r(0, 6, 6, 6), r(6, 6, 6, 6), r(0, 12, 6, 6), r(6, 12, 6, 6)],
  },
  "staggered-6": {
    description: "6 panels of varied widths. Lively back-and-forth, energetic pacing.",
    panels: [r(0, 0, 7, 6), r(7, 0, 5, 6), r(0, 6, 5, 6), r(5, 6, 7, 6), r(0, 12, 7, 6), r(7, 12, 5, 6)],
  },
};

/** Used when the writer's panel count doesn't match the layout it picked. */
const DEFAULT_LAYOUT_FOR_COUNT: Record<number, LayoutId> = {
  1: "splash",
  2: "two-tier",
  3: "big-top",
  4: "grid-4",
  5: "five",
  6: "grid-6",
};

export function fitLayout(layout: LayoutId, panelCount: number): LayoutId {
  if (LAYOUTS[layout]?.panels.length === panelCount) return layout;
  return DEFAULT_LAYOUT_FOR_COUNT[Math.min(Math.max(panelCount, 1), 6)];
}

export function layoutMenu(): string {
  return LAYOUT_IDS.map((id) => `- "${id}" (${LAYOUTS[id].panels.length} panels): ${LAYOUTS[id].description}`).join("\n");
}

export function panelAspect(rect: Rect): number {
  return rect.w / rect.h;
}

export function describeShape(aspect: number): string {
  if (aspect >= 1.8) return "a very wide horizontal panel (panoramic strip)";
  if (aspect >= 1.25) return "a wide horizontal panel";
  if (aspect > 0.8) return "a roughly square panel";
  if (aspect > 0.45) return "a tall vertical panel";
  return "a very tall, narrow vertical panel";
}

/**
 * Image size to request for a panel of the given shape: about one megapixel,
 * both sides multiples of 16, aspect ratio kept between 1:3 and 3:1.
 */
export function imageSizeForAspect(aspect: number): string {
  const clamped = Math.min(Math.max(aspect, 1 / 3), 3);
  const pixels = 1024 * 1024;
  const round16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);
  const width = round16(Math.sqrt(pixels * clamped));
  const height = round16(Math.sqrt(pixels / clamped));
  return `${width}x${height}`;
}

/** Comic pages are 2:3 (portrait), like a printed comic book. */
export const COVER_SIZE = "1024x1536";
