// Render Engine (runs in the browser): lays out comic pages, letters captions and balloons
// on top of the artwork, and builds the downloadable PDF. The same drawing code is used on
// screen and in downloads, so they always match.

import { PDFDocument } from "pdf-lib";
import type { ComicScript, CoverDesign, CoverFont, DialogueLine, LetterPos, Page, Panel } from "../comic";
import { COVER_FONT_WEIGHT } from "../cover-fonts";
import { GRID_COLS, GRID_ROWS, LAYOUTS, type PanelFrame, type Rect } from "../layouts";
import type { ComicStyle, LetteringFont, Lettering } from "../styles";

export type RenderFonts = Record<"title" | LetteringFont, string> & { cover: Record<CoverFont, string> };

/** Pages are 2:3 portrait (like a printed comic book), 1600×2400 pixels. */
export const PAGE_W = 1600;
export const PAGE_H = 2400;
const MARGIN = 64;
const GUTTER = 26;

type Box = { x: number; y: number; w: number; h: number };

const UNIT_W = (PAGE_W - MARGIN * 2) / GRID_COLS;
const UNIT_H = (PAGE_H - MARGIN * 2) / GRID_ROWS;

export function panelBox(rect: Rect): Box {
  return {
    x: MARGIN + rect.x * UNIT_W + GUTTER / 2,
    y: MARGIN + rect.y * UNIT_H + GUTTER / 2,
    w: rect.w * UNIT_W - GUTTER,
    h: rect.h * UNIT_H - GUTTER,
  };
}

type Px = [number, number];

/** A panel on the page: where its art goes (`box`), its outline if slanted, and the safe area for text. */
export type Frame = { box: Box; path?: Px[]; safe: Box; inset: boolean };

/** Moves every edge of a convex outline inwards by `d` pixels (keeps gutters even on slanted panels). */
function insetPolygon(points: Px[], d: number): Px[] {
  const area = points.reduce((sum, [x1, y1], i) => {
    const [x2, y2] = points[(i + 1) % points.length];
    return sum + (x1 * y2 - x2 * y1);
  }, 0);
  const sign = area > 0 ? 1 : -1;
  const lines = points.map(([x1, y1], i) => {
    const [x2, y2] = points[(i + 1) % points.length];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    // Inward normal for this winding.
    const nx = (-(y2 - y1) / len) * sign;
    const ny = ((x2 - x1) / len) * sign;
    return { x: x1 + nx * d, y: y1 + ny * d, dx: x2 - x1, dy: y2 - y1 };
  });
  return lines.map((line, i) => {
    const prev = lines[(i - 1 + lines.length) % lines.length];
    const det = prev.dx * line.dy - prev.dy * line.dx;
    if (Math.abs(det) < 1e-6) return [line.x, line.y] as Px;
    const t = ((line.x - prev.x) * line.dy - (line.y - prev.y) * line.dx) / det;
    return [prev.x + prev.dx * t, prev.y + prev.dy * t] as Px;
  });
}

/** The biggest upright rectangle (roughly) inside a convex outline: where captions and balloons go. */
function safeBox(points: Px[]): Box {
  const xs = points.map(([x]) => x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const samples = 16;
  const columns = Array.from({ length: samples + 1 }, (_, k) => {
    const x = minX + ((maxX - minX) * k) / samples;
    const ys: number[] = [];
    points.forEach(([x1, y1], i) => {
      const [x2, y2] = points[(i + 1) % points.length];
      if ((x >= Math.min(x1, x2) && x <= Math.max(x1, x2)) && x1 !== x2) ys.push(y1 + ((y2 - y1) * (x - x1)) / (x2 - x1));
      else if (x1 === x2 && Math.abs(x - x1) < 1e-6) ys.push(y1, y2);
    });
    return { x, top: Math.min(...ys), bottom: Math.max(...ys) };
  });
  let best: Box = { x: minX, y: columns[0].top, w: 1, h: 1 };
  for (let a = 0; a < columns.length; a++) {
    for (let b = a + 2; b < columns.length; b++) {
      const range = columns.slice(a, b + 1);
      const top = Math.max(...range.map((c) => c.top));
      const bottom = Math.min(...range.map((c) => c.bottom));
      const w = columns[b].x - columns[a].x;
      if (bottom - top > 0 && w * (bottom - top) > best.w * best.h) best = { x: columns[a].x, y: top, w, h: bottom - top };
    }
  }
  return best;
}

function frameFor(frame: PanelFrame): Frame {
  if (!frame.shape) {
    const box = panelBox(frame);
    return { box, safe: box, inset: !!frame.inset };
  }
  const outline = insetPolygon(frame.shape.map(([gx, gy]) => [MARGIN + gx * UNIT_W, MARGIN + gy * UNIT_H] as Px), GUTTER / 2);
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  return { box, path: outline, safe: safeBox(outline), inset: false };
}

export function pageFrames(page: Page): Frame[] {
  return LAYOUTS[page.layout].panels.map(frameFor);
}

/** Each panel's safe area (for lettering and the editors' overlays). */
export function pageBoxes(page: Page): Box[] {
  return pageFrames(page).map((frame) => frame.safe);
}

function framePath(ctx: CanvasRenderingContext2D, frame: Frame) {
  ctx.beginPath();
  if (frame.path) {
    frame.path.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  } else {
    ctx.rect(frame.box.x, frame.box.y, frame.box.w, frame.box.h);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

export async function ensureFontsLoaded(fonts: RenderFonts): Promise<void> {
  await Promise.all([
    document.fonts.load(`120px ${fonts.title}`),
    document.fonts.load(`700 30px ${fonts.comic}`),
    document.fonts.load(`30px ${fonts.hand}`),
    document.fonts.load(`30px ${fonts.typewriter}`),
    ...(Object.entries(fonts.cover) as [CoverFont, string][]).map(([id, family]) => document.fonts.load(`${COVER_FONT_WEIGHT[id] ?? 400} 120px ${family}`)),
  ]);
}

function isDark(color: string): boolean {
  const n = parseInt(color.replace("#", ""), 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 90;
}

// --- Artwork ---------------------------------------------------------------------------------

/** Draws an image so it fills the box, cropping the overflow (like CSS object-fit: cover). */
function drawCoverFit(ctx: CanvasRenderingContext2D, image: HTMLImageElement, box: Box): void {
  const scale = Math.max(box.w / image.naturalWidth, box.h / image.naturalHeight);
  const sw = box.w / scale;
  const sh = box.h / scale;
  ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, box.x, box.y, box.w, box.h);
}

// --- Lettering ---------------------------------------------------------------------------------

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A word in a balloon or caption; *stressed* words are lettered in bold italic. */
type Word = { text: string; em: boolean; width: number };
type TextBlock = { lines: Word[][]; font: string; emFont: string; space: number; size: number; lineHeight: number; width: number; height: number };

/** Splits text into words, reading *asterisks* as emphasis (which may span several words). */
function parseEmphasis(text: string): { text: string; em: boolean }[] {
  const words: { text: string; em: boolean }[] = [];
  let em = false;
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    // Leading punctuation may come before the opening * ("*mine*." / "(*really*)").
    const opens = /^[^\w*]*\*/.test(raw);
    const closes = raw.length > 1 && /\*[^\w*]*$/.test(raw);
    const clean = raw.replace(/\*+/g, "");
    if (opens) em = true;
    if (clean) words.push({ text: clean, em });
    if (closes || (opens && raw === "*")) em = false;
  }
  return words;
}

function lineWidth(line: Word[], space: number): number {
  return line.reduce((sum, word) => sum + word.width, 0) + space * Math.max(0, line.length - 1);
}

function textBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  size: number,
  maxWidth: number,
): TextBlock {
  const font = `${weight} ${size}px ${family}`;
  const emFont = `italic ${Math.max(weight, 700)} ${size}px ${family}`;
  ctx.font = font;
  const space = ctx.measureText(" ").width;
  const words = parseEmphasis(text).map((word) => {
    ctx.font = word.em ? emFont : font;
    return { ...word, width: ctx.measureText(word.text).width };
  });
  const lines: Word[][] = [];
  let line: Word[] = [];
  for (const word of words) {
    if (line.length && lineWidth([...line, word], space) > maxWidth) {
      lines.push(line);
      line = [word];
    } else {
      line.push(word);
    }
  }
  if (line.length) lines.push(line);
  ctx.font = font;
  const lineHeight = size * 1.18;
  return {
    lines,
    font,
    emFont,
    space,
    size,
    lineHeight,
    width: Math.max(0, ...lines.map((l) => lineWidth(l, space))),
    height: lines.length * lineHeight - (lineHeight - size),
  };
}

/** Comic lettering is traditionally all capitals; handwritten and typewriter fonts read better in mixed case. */
function letterCase(text: string, font: LetteringFont): string {
  return font === "comic" ? text.toUpperCase() : text;
}

type Placed =
  | { type: "caption"; x: number; y: number; w: number; h: number; pad: number; block: TextBlock; pinned: boolean }
  | { type: "balloon"; index: number; x: number; y: number; w: number; h: number; padX: number; padY: number; tail: number; line: DialogueLine; block: TextBlock; s: number; pinned: boolean }
  | { type: "sfx"; x: number; y: number; w: number; h: number; text: string; size: number; tilt: number; pinned: boolean };

/** What a lettering item is: the caption, a balloon (by index) or the sound effect. */
export type LetterKey = "caption" | number | "sfx";

/** A placed caption, balloon or sound effect in page pixels, for the editors' drag handles. */
export type LetteringBox = { panel: number; ref: LetterKey; x: number; y: number; w: number; h: number };

const toPixels = (pos: LetterPos) => ({ x: pos.x * PAGE_W, y: pos.y * PAGE_H, w: pos.w * PAGE_W });

/**
 * Positions the caption and balloons in reading order (top-left to bottom-right).
 * Anything the user dragged ("pinned") stays exactly where they put it.
 */
function layoutLettering(
  ctx: CanvasRenderingContext2D,
  panel: Panel,
  box: Box,
  lettering: Lettering,
  fonts: RenderFonts,
  s: number,
): { items: Placed[]; bottom: number } {
  const pad = 20 * s;
  const mid = box.x + box.w / 2;
  const cursor = { left: box.y + pad, right: box.y + pad };
  const items: Placed[] = [];
  let prevTop = box.y;

  const occupy = (x: number, w: number, bottom: number) => {
    if (x < mid) cursor.left = Math.max(cursor.left, bottom);
    if (x + w > mid) cursor.right = Math.max(cursor.right, bottom);
  };
  const topFor = (x: number, w: number) =>
    Math.max(x < mid ? cursor.left : box.y + pad, x + w > mid ? cursor.right : box.y + pad, prevTop + 14 * s);

  if (panel.caption.trim()) {
    const pinned = panel.captionPos ? toPixels(panel.captionPos) : null;
    const scale = pinned ? 1 : s;
    const capPad = 14 * scale;
    const maxW = pinned
      ? Math.max(60, pinned.w - capPad * 2)
      : box.w < 720
        ? box.w - pad * 2 - capPad * 2
        : Math.min(box.w * 0.62, 820);
    const block = textBlock(
      ctx,
      letterCase(panel.caption, lettering.captionFont),
      fonts[lettering.captionFont],
      lettering.captionFont === "comic" ? 700 : 400,
      (lettering.captionFont === "comic" ? 26 : 30) * scale,
      maxW,
    );
    const w = pinned ? pinned.w : block.width + capPad * 2;
    const h = block.height + capPad * 2;
    const x = pinned ? pinned.x : box.x + pad;
    const y = pinned ? pinned.y : box.y + pad;
    items.push({ type: "caption", x, y, w, h, pad: capPad, block, pinned: !!pinned });
    if (!pinned) {
      occupy(x, w, y + h + 12 * s);
      prevTop = y;
    }
  }

  const sides = new Set(panel.dialogue.map((line) => line.side));
  const share = sides.size > 1 ? 0.46 : 0.62;
  panel.dialogue.forEach((line, index) => {
    if (!line.text.trim()) return;
    const pinned = line.pos ? toPixels(line.pos) : null;
    const scale = pinned ? 1 : s;
    const extra = line.kind === "shout" ? 16 * scale : line.kind === "thought" ? 14 * scale : 0;
    const padX = 22 * scale + extra;
    const padY = 14 * scale + extra;
    const maxText = pinned
      ? Math.max(60, pinned.w - padX * 2)
      : Math.max(Math.min(box.w * share, 640) - padX * 2, Math.min(200, box.w - pad * 2 - padX * 2));
    const font = line.kind === "robot" ? "typewriter" : lettering.balloonFont;
    // Quiet lines are lettered smaller; shouts a little bigger.
    const volume = line.kind === "whisper" ? 0.86 : line.kind === "shout" ? 1.08 : 1;
    const block = textBlock(
      ctx,
      line.kind === "robot" ? line.text.toUpperCase() : letterCase(line.text, font),
      fonts[font],
      font === "comic" ? 700 : 400,
      (font === "comic" ? 28 : 33) * scale * volume,
      maxText,
    );
    const w = pinned ? pinned.w : block.width + padX * 2;
    const h = block.height + padY * 2;
    const tail = 34 * scale;
    if (pinned) {
      items.push({ type: "balloon", index, x: pinned.x, y: pinned.y, w, h, padX, padY, tail, line, block, s: scale, pinned: true });
      return;
    }
    const x = line.side === "left" ? box.x + pad : box.x + box.w - pad - w;
    let y = topFor(x, w);
    // A reply to the left of the previous balloon must sit clearly lower, or it would be read first.
    const prev = [...items].reverse().find((item) => !item.pinned);
    if (prev?.type === "balloon" && prev.x > x) y = Math.max(y, prev.y + prev.h * 0.75);
    items.push({ type: "balloon", index, x, y, w, h, padX, padY, tail, line, block, s, pinned: false });
    occupy(x, w, y + h + tail + 6 * s);
    prevTop = y;
  });

  const auto = items.filter((item) => !item.pinned);
  const bottom = Math.max(box.y, ...auto.map((item) => item.y + item.h + (item.type === "balloon" ? item.tail : 0)));

  // Sound effect: big and tilted near the bottom of the panel, unless the user moved it.
  const sfx = panel.sfx?.trim();
  if (sfx) {
    const text = sfx.toUpperCase();
    const auto = Math.min(Math.max(Math.min(box.w, box.h) * 0.2, 64), 190);
    ctx.font = `${auto}px ${fonts.title}`;
    const autoW = ctx.measureText(text).width + auto * 0.4;
    const pinned = panel.sfxPos ? toPixels(panel.sfxPos) : null;
    const size = pinned ? Math.min(Math.max(auto * (pinned.w / autoW), 40), 320) : auto;
    ctx.font = `${size}px ${fonts.title}`;
    const w = ctx.measureText(text).width + size * 0.4;
    const h = size * 1.15;
    const right = text.length % 2 === 0;
    const x = pinned ? pinned.x : right ? box.x + box.w - w - pad : box.x + pad;
    const y = pinned ? pinned.y : box.y + box.h - h - pad - box.h * 0.06;
    items.push({ type: "sfx", x, y, w, h, text, size, tilt: right ? -7 : 6, pinned: !!pinned });
  }
  return { items, bottom };
}

function drawTextLines(ctx: CanvasRenderingContext2D, block: TextBlock, x: number, y: number, align: "left" | "center") {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  block.lines.forEach((line, i) => {
    let cursor = align === "center" ? x - lineWidth(line, block.space) / 2 : x;
    for (const word of line) {
      ctx.font = word.em ? block.emFont : block.font;
      ctx.fillText(word.text, cursor, y + i * block.lineHeight);
      cursor += word.width + block.space;
    }
  });
  ctx.font = block.font;
}

/** Points around a rectangle's edge, each with its outward direction. */
function perimeter(x: number, y: number, w: number, h: number, spacing: number) {
  const points: { px: number; py: number; nx: number; ny: number }[] = [];
  const edges = [
    { x0: x, y0: y, dx: w, dy: 0, nx: 0, ny: -1 },
    { x0: x + w, y0: y, dx: 0, dy: h, nx: 1, ny: 0 },
    { x0: x + w, y0: y + h, dx: -w, dy: 0, nx: 0, ny: 1 },
    { x0: x, y0: y + h, dx: 0, dy: -h, nx: -1, ny: 0 },
  ];
  for (const edge of edges) {
    const length = Math.hypot(edge.dx, edge.dy);
    const steps = Math.max(1, Math.round(length / spacing));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const corner = i === 0;
      const prevNormal = edges[(edges.indexOf(edge) + 3) % 4];
      points.push({
        px: edge.x0 + edge.dx * t,
        py: edge.y0 + edge.dy * t,
        nx: corner ? (edge.nx + prevNormal.nx) * 0.75 : edge.nx,
        ny: corner ? (edge.ny + prevNormal.ny) * 0.75 : edge.ny,
      });
    }
  }
  return points;
}

function drawBalloon(ctx: CanvasRenderingContext2D, item: Extract<Placed, { type: "balloon" }>, ink: string, fill: string, outline: string) {
  const { x, y, w, h, tail, line, s } = item;
  const left = line.side === "left";
  const stroke = (line.kind === "whisper" ? 3 : outline === ink ? 4 : 5) * s;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = line.kind === "whisper" ? "#6b6b6b" : outline;
  ctx.lineWidth = stroke;
  ctx.lineJoin = "round";
  if (line.kind === "whisper") ctx.setLineDash([10 * s, 8 * s]);

  // Tail: a pointer toward the speaker (or a trail of little bubbles for thoughts).
  const baseCenter = x + w * (left ? 0.3 : 0.7);
  const tipX = baseCenter + (left ? -24 : 24) * s;
  const tipY = y + h + tail;
  const drawTail = (inset: number) => {
    ctx.beginPath();
    ctx.moveTo(baseCenter - 16 * s + inset, y + h - 12 * s);
    ctx.lineTo(tipX, tipY - inset);
    ctx.lineTo(baseCenter + 16 * s - inset, y + h - 12 * s);
    ctx.closePath();
  };

  if (line.kind === "thought") {
    const r = 16 * s;
    for (const point of perimeter(x + r, y + r, w - r * 2, h - r * 2, r * 1.3)) {
      ctx.beginPath();
      ctx.arc(point.px, point.py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillRect(x + r * 0.6, y + r * 0.6, w - r * 1.2, h - r * 1.2);
    for (const [k, radius] of [
      [0.45, 9],
      [0.85, 6],
    ] as const) {
      ctx.beginPath();
      ctx.arc(baseCenter + (tipX - baseCenter) * k, y + h + tail * k, radius * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (line.kind === "shout") {
    ctx.lineWidth = stroke * 1.3;
    drawTail(0);
    ctx.fill();
    ctx.stroke();
    const spike = 14 * s;
    const points = perimeter(x + spike, y + spike, w - spike * 2, h - spike * 2, 34 * s);
    ctx.beginPath();
    points.forEach((p, i) => {
      const out = i % 2 === 0 ? spike : spike * 0.15;
      ctx[i === 0 ? "moveTo" : "lineTo"](p.px + p.nx * out, p.py + p.ny * out);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    drawTail(stroke);
    ctx.fill();
  } else if (line.kind === "robot") {
    // Machines, AIs and monsters: a geometric box with cut corners and a double outline.
    const cut = Math.min(18 * s, h / 3);
    const octagon = (inset: number) => {
      ctx.beginPath();
      ctx.moveTo(x + cut + inset, y + inset);
      ctx.lineTo(x + w - cut - inset, y + inset);
      ctx.lineTo(x + w - inset, y + cut + inset);
      ctx.lineTo(x + w - inset, y + h - cut - inset);
      ctx.lineTo(x + w - cut - inset, y + h - inset);
      ctx.lineTo(x + cut + inset, y + h - inset);
      ctx.lineTo(x + inset, y + h - cut - inset);
      ctx.lineTo(x + inset, y + cut + inset);
      ctx.closePath();
    };
    drawTail(0);
    ctx.fill();
    ctx.stroke();
    octagon(0);
    ctx.fill();
    ctx.stroke();
    drawTail(stroke);
    ctx.fill();
    ctx.lineWidth = stroke * 0.5;
    octagon(7 * s);
    ctx.stroke();
  } else {
    drawTail(0);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(h / 2, 46 * s));
    ctx.fill();
    ctx.stroke();
    drawTail(stroke);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = line.kind === "whisper" ? "#3f3f3f" : ink;
  drawTextLines(ctx, item.block, x + w / 2, y + item.padY, "center");
}

/** A sound effect: chunky letters with a thick outline and a hard shadow, slightly tilted (on a starburst in pop styles). */
function drawSfx(ctx: CanvasRenderingContext2D, item: Extract<Placed, { type: "sfx" }>, lettering: Lettering, fonts: RenderFonts) {
  ctx.save();
  ctx.translate(item.x + item.w / 2, item.y + item.h / 2);
  ctx.rotate((item.tilt * Math.PI) / 180);
  if (lettering.sfxBurst) {
    const outer = Math.max(item.w * 0.62, item.h * 0.95);
    const points = 14;
    ctx.beginPath();
    for (let k = 0; k < points * 2; k++) {
      const radius = k % 2 === 0 ? outer * (k % 4 === 0 ? 1 : 0.88) : outer * 0.62;
      const angle = (Math.PI * k) / points;
      ctx[k === 0 ? "moveTo" : "lineTo"](Math.cos(angle) * radius, Math.sin(angle) * radius * 0.72);
    }
    ctx.closePath();
    ctx.fillStyle = lettering.sfxBurst;
    ctx.fill();
    ctx.lineWidth = item.size * 0.06;
    ctx.strokeStyle = lettering.sfxOutline ?? "#111111";
    ctx.lineJoin = "miter";
    ctx.stroke();
  }
  ctx.font = `${item.size}px ${fonts.title}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.letterSpacing = `${item.size * 0.03}px`;
  ctx.lineWidth = item.size * 0.2;
  ctx.strokeStyle = lettering.sfxOutline ?? "#111111";
  ctx.strokeText(item.text, item.size * 0.06, item.size * 0.06);
  ctx.strokeText(item.text, 0, 0);
  ctx.fillStyle = lettering.sfxFill ?? "#facc15";
  ctx.fillText(item.text, 0, 0);
  ctx.restore();
  ctx.letterSpacing = "0px";
}

/** A speaker's balloon outline: their accent colour in styles that use them, otherwise the style's ink. */
function outlineFor(lettering: Lettering, speaker: string, speakers: string[]): string {
  const accents = lettering.speakerAccents;
  const index = speakers.findIndex((name) => name.toLowerCase() === speaker.toLowerCase());
  if (!accents?.length || index < 0) return lettering.balloonInk ?? "#111111";
  return accents[index % accents.length];
}

/** Lays out one panel's lettering, shrinking it a little if it would cover too much of a small panel. */
function panelLettering(ctx: CanvasRenderingContext2D, panel: Panel, box: Box, lettering: Lettering, fonts: RenderFonts): Placed[] {
  let layout = layoutLettering(ctx, panel, box, lettering, fonts, 1);
  for (const s of [0.88, 0.78, 0.7]) {
    if (layout.bottom - box.y <= box.h * 0.6) break;
    layout = layoutLettering(ctx, panel, box, lettering, fonts, s);
  }
  return layout.items;
}

function drawLettering(ctx: CanvasRenderingContext2D, items: Placed[], lettering: Lettering, fonts: RenderFonts, speakers: string[]) {
  for (const item of items) {
    if (item.type === "sfx") {
      drawSfx(ctx, item, lettering, fonts);
    } else if (item.type === "caption") {
      ctx.fillStyle = lettering.captionFill;
      ctx.strokeStyle = lettering.captionInk;
      ctx.lineWidth = 3;
      ctx.fillRect(item.x, item.y, item.w, item.h);
      ctx.strokeRect(item.x, item.y, item.w, item.h);
      ctx.fillStyle = lettering.captionInk;
      drawTextLines(ctx, item.block, item.x + item.pad, item.y + item.pad, "left");
    } else {
      drawBalloon(ctx, item, "#111111", lettering.balloonFill ?? "#ffffff", outlineFor(lettering, item.line.speaker, speakers));
    }
  }
}

/** Where every caption and balloon on a page ends up, in page pixels (for drag handles). */
export function letteringBoxes(ctx: CanvasRenderingContext2D, page: Page, style: ComicStyle, fonts: RenderFonts): LetteringBox[] {
  return pageBoxes(page).flatMap((box, panel) =>
    page.panels[panel]
      ? panelLettering(ctx, page.panels[panel], box, style.lettering, fonts).map((item) => ({
          panel,
          ref: item.type === "balloon" ? item.index : item.type,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h + (item.type === "balloon" ? item.tail : 0),
        }))
      : [],
  );
}

// --- Storyboard wireframes ----------------------------------------------------------------------

/** A quick stick-figure sketch of a panel, drawn by code (free and instant), for the storyboard. */
function drawWireframe(
  ctx: CanvasRenderingContext2D,
  panel: Panel,
  box: Box,
  names: string[],
  fonts: RenderFonts,
  stageLabels: Record<string, string> = {},
) {
  const ink = "#9a9488";
  ctx.fillStyle = "#fbfaf7";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = "round";

  const lower = (text: string) => text.toLowerCase();
  const inScene = names.filter((name) => {
    const first = lower(name.split(/\s+/)[0]);
    return lower(panel.scene).includes(lower(name)) || (first.length >= 3 && lower(panel.scene).includes(first));
  });
  const speakers = [...new Map(panel.dialogue.map((line) => [line.speaker, line.side])).entries()];
  // Prefer the director's scene context (exactly who is in frame, at which age); fall back to names in the text.
  const present = panel.context?.cast.length ? panel.context.cast.map((person) => person.name) : inScene;
  const figures: { name: string; side: "left" | "right" | "middle"; stage?: string }[] = [
    ...speakers.map(([name, side]) => ({ name, side })),
    ...present.filter((name) => !speakers.some(([speaker]) => speaker === name)).map((name) => ({ name, side: "middle" as const })),
  ]
    .slice(0, 4)
    .map((figure) => {
      const stage = panel.context?.cast.find((person) => person.name === figure.name)?.stage;
      return { ...figure, stage: stage ? stageLabels[`${figure.name}|${stage}`] ?? stage : undefined };
    });

  // Shot type sets how big the figures are (closer shots crop below the frame) and whether we see the horizon.
  const framing = {
    establishing: { height: 0.3, ground: 0.84 },
    wide: { height: 0.5, ground: 0.88 },
    medium: { height: 0.95, ground: 1.25 },
    "close-up": { height: 1.6, ground: 1.9 },
    "extreme close-up": { height: 2.6, ground: 2.9 },
  }[panel.shot] ?? { height: 0.6, ground: 0.9 };
  const height = box.h * framing.height;
  const groundY = box.y + box.h * framing.ground;
  ctx.lineWidth = 3;
  if (panel.shot === "establishing" || panel.shot === "wide") {
    ctx.beginPath();
    ctx.moveTo(box.x, groundY);
    ctx.lineTo(box.x + box.w, groundY);
    ctx.stroke();
    if (panel.shot === "establishing") {
      // A simple skyline so the setting reads as a place.
      ctx.globalAlpha = 0.5;
      let x = box.x + 10;
      for (let i = 0; x < box.x + box.w - 20; i++) {
        const w = box.w * (0.07 + ((i * 37) % 5) * 0.015);
        const h = box.h * (0.12 + ((i * 53) % 7) * 0.035);
        ctx.strokeRect(x, groundY - h, w, h);
        x += w + box.w * 0.02;
      }
      ctx.globalAlpha = 1;
    }
  }

  // Spread figures evenly: people on the left, then the middle, then the right.
  const order = { left: 0, middle: 1, right: 2 } as const;
  const placed = [...figures].sort((a, b) => order[a.side] - order[b.side]);
  placed.forEach((figure, i) => {
    const cx = box.x + box.w * (placed.length === 1 ? (figure.side === "left" ? 0.3 : figure.side === "right" ? 0.7 : 0.5) : 0.18 + (0.64 * i) / (placed.length - 1));
    const head = height * 0.11;
    const top = groundY - height;
    ctx.lineWidth = Math.max(3, height * 0.018);
    ctx.beginPath();
    ctx.arc(cx, top + head, head, 0, Math.PI * 2);
    ctx.stroke();
    const neck = top + head * 2;
    const hip = top + height * 0.58;
    const reach = Math.min(height * 0.16, (box.w / Math.max(placed.length, 1)) * 0.35);
    ctx.beginPath();
    ctx.moveTo(cx, neck);
    ctx.lineTo(cx, hip);
    ctx.moveTo(cx - reach, neck + height * 0.12);
    ctx.lineTo(cx, neck + height * 0.06);
    ctx.lineTo(cx + reach, neck + height * 0.12);
    ctx.moveTo(cx - reach * 0.75, groundY);
    ctx.lineTo(cx, hip);
    ctx.lineTo(cx + reach * 0.75, groundY);
    ctx.stroke();
    // Name inside the head (or just below it if the head is small).
    const size = Math.max(16, Math.min(30, head * 0.55));
    ctx.font = `700 ${size}px ${fonts.comic}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labelY = head > size * 1.4 ? top + head : top + head * 2 + size;
    const labelAt = Math.min(box.y + box.h - 40, labelY);
    ctx.fillText(figure.name.split(/\s+/)[0].toUpperCase(), cx, labelAt);
    if (figure.stage) {
      ctx.font = `400 ${Math.max(14, size * 0.7)}px ${fonts.comic}`;
      ctx.fillText(`(${figure.stage.split(/[(,]/)[0].trim().toLowerCase()})`, cx, labelAt + size);
    }
  });

  // What the artist will draw, so the user can read the plan.
  if (panel.scene.trim()) {
    ctx.font = `italic 400 20px ${fonts.comic}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    const lines = wrapText(ctx, `🎬 ${panel.scene}`, box.w - 32).slice(0, 2);
    if (wrapText(ctx, `🎬 ${panel.scene}`, box.w - 32).length > 2) lines[1] = `${lines[1].replace(/\s+\S*$/, "")}…`;
    ctx.fillStyle = "#6b665c";
    lines.forEach((line, i) => ctx.fillText(line, box.x + 16, box.y + box.h - 12 - (lines.length - 1 - i) * 24));
  }
  ctx.font = `700 22px ${fonts.comic}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#6b665c";
  ctx.fillText(panel.shot.toUpperCase(), box.x + box.w - 14, box.y + 10);
  if (panel.hero) {
    // Hero panels get a badge, so the user sees where the extra effort goes.
    ctx.font = `700 24px ${fonts.comic}`;
    const label = "★ HERO PANEL";
    const w = ctx.measureText(label).width + 24;
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 3;
    ctx.fillRect(box.x + box.w - w - 10, box.y + 40, w, 36);
    ctx.strokeRect(box.x + box.w - w - 10, box.y + 40, w, 36);
    ctx.fillStyle = "#111111";
    ctx.fillText(label, box.x + box.w - 22, box.y + 46);
  }
}

// --- Pages ------------------------------------------------------------------------------------

export function createPageCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  return canvas;
}

/**
 * Draws one comic page. Panels whose art isn't ready yet are drawn as blank boxes (lettering
 * still shows). In storyboard mode every panel is a stick-figure wireframe instead.
 */
export function drawPage(
  ctx: CanvasRenderingContext2D,
  page: Page,
  pageNumber: number,
  images: (HTMLImageElement | null)[],
  style: ComicStyle,
  fonts: RenderFonts,
  options: { wireframe?: { names: string[]; stageLabels?: Record<string, string> }; speakers?: string[] } = {},
): void {
  const { lettering } = style;
  const dark = !options.wireframe && isDark(lettering.pageColor);
  ctx.fillStyle = options.wireframe ? "#ffffff" : lettering.pageColor;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  const frames = pageFrames(page);
  const boxes = frames.map((frame) => frame.safe);
  const pageColor = options.wireframe ? "#ffffff" : lettering.pageColor;

  // Pass 1: artwork, clipped to each panel's outline (inset panels last, on top of the big image).
  const order = frames.map((frame, i) => ({ frame, i })).sort((a, b) => Number(a.frame.inset) - Number(b.frame.inset));
  for (const { frame, i } of order) {
    const panel = page.panels[i];
    if (!panel) continue;
    const box = frame.box;
    if (frame.inset) {
      // A frame of page colour separates the inset from the image underneath.
      ctx.fillStyle = pageColor;
      ctx.fillRect(box.x - GUTTER, box.y - GUTTER, box.w + GUTTER * 2, box.h + GUTTER * 2);
    }
    ctx.save();
    framePath(ctx, frame);
    ctx.clip();
    const image = images[i];
    if (options.wireframe) {
      // Sketch inside the panel's safe area, so slanted edges never cut off figures or notes.
      ctx.fillStyle = "#fbfaf7";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      drawWireframe(ctx, panel, frame.safe, options.wireframe.names, fonts, options.wireframe.stageLabels);
    } else if (image) {
      drawCoverFit(ctx, image, box);
    } else {
      ctx.fillStyle = dark ? "#262626" : "#ece8df";
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    ctx.restore();
    ctx.strokeStyle = dark ? "#e5e5e5" : "#111111";
    ctx.lineWidth = options.wireframe ? 3 : 5;
    ctx.lineJoin = "miter";
    framePath(ctx, frame);
    ctx.stroke();
  }

  // Print texture (pop styles): halftone dots in the midtones and shadows, added by us rather than
  // asked of the image model, which tends to smear dots.
  if (!options.wireframe && lettering.texture === "halftone" && images.some(Boolean)) {
    applyHalftone(ctx, frames.filter((_, i) => images[i]));
  }

  // Pass 2: lettering on top of everything, so a balloon the user moved can cross a panel border.
  boxes.forEach((box, i) => {
    const panel = page.panels[i];
    if (panel) drawLettering(ctx, panelLettering(ctx, panel, box, lettering, fonts), lettering, fonts, options.speakers ?? options.wireframe?.names ?? []);
  });

  ctx.fillStyle = dark ? "#a3a3a3" : "#555555";
  ctx.font = `700 24px ${fonts.comic}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(pageNumber), PAGE_W / 2, PAGE_H - MARGIN / 2);
}

/** Ben-Day style halftone: dots sized by how dark the art is underneath, clipped to each panel. */
function applyHalftone(ctx: CanvasRenderingContext2D, frames: Frame[]) {
  const cell = 11;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, PAGE_W, PAGE_H).data;
  } catch {
    return;
  }
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  for (const frame of frames) {
    ctx.save();
    framePath(ctx, frame);
    ctx.clip();
    ctx.beginPath();
    const { x: bx, y: by, w, h } = frame.box;
    for (let row = 0, y = by; y < by + h; row++, y += cell * 0.87) {
      for (let x = bx + (row % 2 ? cell / 2 : 0); x < bx + w; x += cell) {
        const px = Math.min(PAGE_W - 1, Math.max(0, Math.round(x)));
        const py = Math.min(PAGE_H - 1, Math.max(0, Math.round(y)));
        const i = (py * PAGE_W + px) * 4;
        const darkness = 1 - (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) / 255;
        const radius = cell * 0.55 * Math.pow(darkness, 1.4);
        if (radius < 0.8) continue;
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// --- Cover --------------------------------------------------------------------------------------

/** Average brightness (0–255) of a region of what's already drawn, in page coordinates. */
function regionLuminance(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): number {
  const t = ctx.getTransform();
  const px = Math.max(0, Math.floor(x * t.a + t.e));
  const py = Math.max(0, Math.floor(y * t.d + t.f));
  const pw = Math.max(1, Math.min(ctx.canvas.width - px, Math.ceil(w * t.a)));
  const ph = Math.max(1, Math.min(ctx.canvas.height - py, Math.ceil(h * t.d)));
  try {
    const data = ctx.getImageData(px, py, pw, ph).data;
    let sum = 0;
    let count = 0;
    const step = Math.max(4, Math.floor(data.length / 4 / 4000)) * 4;
    for (let i = 0; i < data.length; i += step) {
      sum += data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
      count++;
    }
    return count ? sum / count : 128;
  } catch {
    return 128; // e.g. a tainted canvas: assume mid-grey and use a backing behind the text.
  }
}

function luminanceOf(color: string): number {
  const n = parseInt(color.replace("#", ""), 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
}

const SIZE_STEPS: Record<NonNullable<CoverDesign["titleSize"]>, { max: number; min: number; width: number }> = {
  huge: { max: 250, min: 110, width: 1 },
  large: { max: 190, min: 90, width: 0.86 },
  medium: { max: 128, min: 64, width: 0.66 },
  small: { max: 84, min: 46, width: 0.5 },
};

/** The full title treatment, with sensible defaults for covers designed before these options existed. */
function titleStyle(design: CoverDesign | undefined) {
  const font = design?.titleFont ?? "bangers";
  return {
    font,
    weight: COVER_FONT_WEIGHT[font] ?? 400,
    fill: design?.titleFill ?? "#facc15",
    outline: design?.titleOutline ?? "#111111",
    position: design?.titlePosition ?? "top",
    size: design?.titleSize ?? "huge",
    align: design?.titleAlign ?? "center",
    upper: design?.titleCase ? design.titleCase === "upper" : !["playfair", "bodoni", "fraunces", "caveat"].includes(font),
    tracking: Math.min(Math.max(design?.titleTracking ?? 0, -0.05), 0.4),
    treatment: design?.titleTreatment ?? (design ? "outline" : "outline"),
    band: design?.titleBand ?? "#111111",
    rotation: Math.min(Math.max(design?.titleRotation ?? 0, -8), 8),
  };
}

const COVER_MARGIN = 96;

/**
 * Draws the front cover: full-bleed art, then the title and tagline lettered by our code (so
 * they're always spelled right and stay editable), art-directed per comic: size, alignment,
 * tracking, tilt and treatment come from the cover design. The tagline checks the art behind it
 * and picks a readable colour and backing, so it can never disappear into a light background.
 */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  script: ComicScript,
  image: HTMLImageElement | null,
  style: ComicStyle,
  fonts: RenderFonts,
): void {
  const full = { x: 0, y: 0, w: PAGE_W, h: PAGE_H };
  if (image) {
    drawCoverFit(ctx, image, full);
  } else {
    ctx.fillStyle = "#ece8df";
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  }

  const design = script.cover?.design;
  const t = titleStyle(design);
  const family = fonts.cover[t.font] ?? fonts.title;
  const contentW = PAGE_W - COVER_MARGIN * 2;
  const steps = SIZE_STEPS[t.size];
  const maxW = contentW * steps.width;
  const title = t.upper ? script.title.toUpperCase() : script.title;

  // Fit the title: as big as this size allows, at most three lines (stacked: one word per line).
  const setFont = (size: number) => {
    ctx.font = `${t.weight} ${size}px ${family}`;
    ctx.letterSpacing = `${t.tracking * size}px`;
  };
  type Line = { text: string; size: number };
  let lines: Line[] = [];
  if (t.treatment === "stacked") {
    const words = title.split(/\s+/).filter(Boolean);
    const rows = words.length > 4 ? wrapToRows(words, 3) : words;
    lines = rows.map((text) => {
      let size = steps.max * 1.3;
      for (; size > steps.min; size -= 6) {
        setFont(size);
        if (ctx.measureText(text).width <= maxW) break;
      }
      return { text, size };
    });
  } else {
    let size = steps.max;
    let wrapped: string[] = [];
    for (; size >= steps.min; size -= 6) {
      setFont(size);
      wrapped = wrapText(ctx, title, maxW);
      if (wrapped.length <= 3 && wrapped.every((l) => ctx.measureText(l).width <= maxW)) break;
    }
    lines = wrapped.map((text) => ({ text, size: Math.max(size, steps.min) }));
  }
  const lineGap = (size: number) => size * (t.treatment === "stacked" ? 0.92 : 1.0);
  const blockH = lines.reduce((sum, line) => sum + lineGap(line.size), 0);
  const widths = lines.map((line) => {
    setFont(line.size);
    return ctx.measureText(line.text).width;
  });
  const blockW = Math.max(...widths, 1);

  const taglineText = script.tagline.trim();
  const titleTop =
    t.position === "bottom"
      ? PAGE_H - COVER_MARGIN - (taglineText && design ? 40 : 0) - blockH - 40
      : t.position === "middle"
        ? (PAGE_H - blockH) / 2
        : COVER_MARGIN + 90;
  const anchorX = t.align === "left" ? COVER_MARGIN : t.align === "right" ? PAGE_W - COVER_MARGIN : PAGE_W / 2;
  const blockLeft = t.align === "left" ? COVER_MARGIN : t.align === "right" ? PAGE_W - COVER_MARGIN - blockW : (PAGE_W - blockW) / 2;

  // If the art behind the title would swallow it, add an outline and shadow automatically.
  const behind = regionLuminance(ctx, blockLeft, titleTop, blockW, blockH);
  const weakContrast = Math.abs(behind - luminanceOf(t.fill)) < 70;
  const treatment = weakContrast && (t.treatment === "solid" || t.treatment === "hollow" || t.treatment === "stacked") ? "shadow" : t.treatment;

  ctx.save();
  if (t.rotation) {
    const cx = blockLeft + blockW / 2;
    const cy = titleTop + blockH / 2;
    ctx.translate(cx, cy);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  if (treatment === "band") {
    const pad = (lines[0]?.size ?? 100) * 0.28;
    ctx.fillStyle = t.band;
    ctx.fillRect(t.align === "center" ? 0 : blockLeft - pad, titleTop - pad * 0.7, t.align === "center" ? PAGE_W : blockW + pad * 2, blockH + pad * 1.1);
  }
  ctx.textAlign = t.align;
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  let y = titleTop;
  for (const line of lines) {
    setFont(line.size);
    ctx.save();
    if (treatment === "shadow" || weakContrast) {
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = line.size * 0.14;
      ctx.shadowOffsetY = line.size * 0.04;
    }
    if (treatment === "outline" || treatment === "hollow" || weakContrast) {
      ctx.strokeStyle = treatment === "hollow" ? t.fill : t.outline;
      ctx.lineWidth = line.size * (treatment === "hollow" ? 0.045 : 0.07);
      ctx.strokeText(line.text, anchorX, y);
    }
    ctx.restore();
    if (treatment !== "hollow") {
      ctx.fillStyle = t.fill;
      ctx.fillText(line.text, anchorX, y);
    }
    y += lineGap(line.size);
  }
  ctx.restore();
  ctx.letterSpacing = "0px";

  // A small publisher mark, out of the title's way.
  const badgeRight = t.position === "top" && t.align !== "right";
  ctx.font = `30px ${fonts.title}`;
  ctx.letterSpacing = "2px";
  const badgeW = ctx.measureText("COMIC.ME").width + 28;
  const badgeX = badgeRight ? PAGE_W - 48 - badgeW : 48;
  const badgeY = t.position === "top" ? PAGE_H - 48 - 46 : 48;
  ctx.fillStyle = "#facc15";
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 3;
  ctx.fillRect(badgeX, badgeY, badgeW, 46);
  ctx.strokeRect(badgeX, badgeY, badgeW, 46);
  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("COMIC.ME", badgeX + badgeW / 2, badgeY + 25);
  ctx.letterSpacing = "0px";

  if (!taglineText) return;
  if (!design) {
    // Covers made before cover designs existed: a caption box near the bottom.
    const block = textBlock(ctx, taglineText.toUpperCase(), fonts.comic, 700, 44, PAGE_W - 360);
    const pad = 24;
    const w = block.width + pad * 2;
    const h = block.height + pad * 2;
    const x = (PAGE_W - w) / 2;
    const boxY = PAGE_H - 160 - h;
    ctx.fillStyle = style.lettering.captionFill;
    ctx.strokeStyle = style.lettering.captionInk;
    ctx.lineWidth = 5;
    ctx.fillRect(x, boxY, w, h);
    ctx.strokeRect(x, boxY, w, h);
    ctx.fillStyle = style.lettering.captionInk;
    drawTextLines(ctx, block, PAGE_W / 2, boxY + pad, "center");
    return;
  }

  // Tagline: understated, like a film poster, always inside the safe area and always readable.
  ctx.letterSpacing = "4px";
  const block = textBlock(ctx, taglineText.toUpperCase(), fonts.comic, 700, 38, Math.min(contentW, 1100));
  const padX = 26;
  const padY = 14;
  const tw = block.width + padX * 2;
  const th = block.height + padY * 2;
  const tx = t.align === "left" ? COVER_MARGIN : t.align === "right" ? PAGE_W - COVER_MARGIN - tw : (PAGE_W - tw) / 2;
  // Title at the bottom: tagline just above it. Otherwise: the foot of the page, clear of the publisher mark.
  const ty = t.position === "bottom" ? Math.max(COVER_MARGIN, titleTop - 36 - th) : PAGE_H - COVER_MARGIN - 70 - th;
  const light = regionLuminance(ctx, tx, ty, tw, th) > 140;
  ctx.fillStyle = light ? "rgba(255,255,255,0.82)" : "rgba(0,0,0,0.6)";
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, th / 2);
  ctx.fill();
  ctx.fillStyle = light ? "#111111" : "#ffffff";
  drawTextLines(ctx, block, tx + tw / 2, ty + padY, "center");
  ctx.letterSpacing = "0px";
}

/** Splits words into at most `rows` lines of similar length (for stacked titles). */
function wrapToRows(words: string[], rows: number): string[] {
  const perRow = Math.ceil(words.length / rows);
  const result: string[] = [];
  for (let i = 0; i < words.length; i += perRow) result.push(words.slice(i, i + perRow).join(" "));
  return result;
}

// --- Downloads --------------------------------------------------------------------------------

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "comic";
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type PageSource = { kind: "cover" } | { kind: "page"; index: number };

/** Renders one page (or the cover) at full resolution, loading its artwork. */
export async function renderFullPage(
  source: PageSource,
  script: ComicScript,
  imageUrlFor: (key: string) => string,
  style: ComicStyle,
  fonts: RenderFonts,
): Promise<HTMLCanvasElement> {
  await ensureFontsLoaded(fonts);
  const canvas = createPageCanvas();
  const ctx = canvas.getContext("2d")!;
  if (source.kind === "cover") {
    drawCover(ctx, script, await loadImage(imageUrlFor("cover")), style, fonts);
  } else {
    const page = script.pages[source.index];
    const images = await Promise.all(page.panels.map((_, i) => loadImage(imageUrlFor(`${source.index + 1}-${i + 1}`))));
    drawPage(ctx, page, source.index + 1, images, style, fonts, { speakers: script.characters.map((c) => c.name) });
  }
  return canvas;
}

export async function downloadPagePng(canvas: HTMLCanvasElement, title: string, label: string): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob) saveBlob(blob, `comic-me-${slugify(title)}-${label}.png`);
}

/** Builds the PDF: cover plus every page, each 2:3 portrait (1600×2400 pixels, about 240 dpi). */
export async function downloadComicPdf(
  script: ComicScript,
  imageUrlFor: (key: string) => string,
  style: ComicStyle,
  fonts: RenderFonts,
): Promise<void> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(script.title);
  pdf.setCreator("Comic.me");

  const sources: PageSource[] = [
    ...(script.cover ? [{ kind: "cover" } as const] : []),
    ...script.pages.map((_, index) => ({ kind: "page", index }) as const),
  ];
  for (const source of sources) {
    const canvas = await renderFullPage(source, script, imageUrlFor, style, fonts);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!jpeg) throw new Error("Could not create the page image.");
    const embedded = await pdf.embedJpg(await jpeg.arrayBuffer());
    const pdfPage = pdf.addPage([480, 720]);
    pdfPage.drawImage(embedded, { x: 0, y: 0, width: 480, height: 720 });
  }

  const bytes = await pdf.save();
  saveBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), `comic-me-${slugify(script.title)}.pdf`);
}
