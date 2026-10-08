// Render Engine (runs in the browser): lays out comic pages, letters captions and balloons
// on top of the artwork, and builds the downloadable PDF. The same drawing code is used on
// screen and in downloads, so they always match.

import { PDFDocument } from "pdf-lib";
import type { ComicScript, CoverFont, DialogueLine, LetterPos, Page, Panel } from "../comic";
import { GRID_COLS, GRID_ROWS, LAYOUTS, type Rect } from "../layouts";
import type { ComicStyle, LetteringFont, Lettering } from "../styles";

export type RenderFonts = Record<"title" | LetteringFont, string> & { cover: Record<CoverFont, string> };

/** Pages are 2:3 portrait (like a printed comic book), 1600×2400 pixels. */
export const PAGE_W = 1600;
export const PAGE_H = 2400;
const MARGIN = 64;
const GUTTER = 26;

type Box = { x: number; y: number; w: number; h: number };

export function panelBox(rect: Rect): Box {
  const unitW = (PAGE_W - MARGIN * 2) / GRID_COLS;
  const unitH = (PAGE_H - MARGIN * 2) / GRID_ROWS;
  return {
    x: MARGIN + rect.x * unitW + GUTTER / 2,
    y: MARGIN + rect.y * unitH + GUTTER / 2,
    w: rect.w * unitW - GUTTER,
    h: rect.h * unitH - GUTTER,
  };
}

export function pageBoxes(page: Page): Box[] {
  return LAYOUTS[page.layout].panels.map(panelBox);
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
    ...Object.values(fonts.cover).map((family) => document.fonts.load(`900 120px ${family}`)),
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

type TextBlock = { lines: string[]; font: string; size: number; lineHeight: number; width: number; height: number };

function textBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  size: number,
  maxWidth: number,
): TextBlock {
  const font = `${weight} ${size}px ${family}`;
  ctx.font = font;
  const lines = wrapText(ctx, text, maxWidth);
  const lineHeight = size * 1.18;
  return {
    lines,
    font,
    size,
    lineHeight,
    width: Math.max(0, ...lines.map((l) => ctx.measureText(l).width)),
    height: lines.length * lineHeight - (lineHeight - size),
  };
}

/** Comic lettering is traditionally all capitals; handwritten and typewriter fonts read better in mixed case. */
function letterCase(text: string, font: LetteringFont): string {
  return font === "comic" ? text.toUpperCase() : text;
}

type Placed =
  | { type: "caption"; x: number; y: number; w: number; h: number; pad: number; block: TextBlock; pinned: boolean }
  | { type: "balloon"; index: number; x: number; y: number; w: number; h: number; padX: number; padY: number; tail: number; line: DialogueLine; block: TextBlock; s: number; pinned: boolean };

/** A placed caption or balloon in page pixels, for the storyboard editor's drag handles. */
export type LetteringBox = { panel: number; ref: "caption" | number; x: number; y: number; w: number; h: number };

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
    const font = lettering.balloonFont;
    const block = textBlock(
      ctx,
      letterCase(line.text, font),
      fonts[font],
      font === "comic" ? 700 : 400,
      (font === "comic" ? 28 : 33) * scale,
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
  return { items, bottom };
}

function drawTextLines(ctx: CanvasRenderingContext2D, block: TextBlock, x: number, y: number, align: "left" | "center") {
  ctx.font = block.font;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  block.lines.forEach((line, i) => ctx.fillText(line, x, y + i * block.lineHeight));
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

function drawBalloon(ctx: CanvasRenderingContext2D, item: Extract<Placed, { type: "balloon" }>, ink: string) {
  const { x, y, w, h, tail, line, s } = item;
  const left = line.side === "left";
  const stroke = 4 * s;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = ink;
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

  ctx.fillStyle = ink;
  drawTextLines(ctx, item.block, x + w / 2, y + item.padY, "center");
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

function drawLettering(ctx: CanvasRenderingContext2D, items: Placed[], lettering: Lettering) {
  for (const item of items) {
    if (item.type === "caption") {
      ctx.fillStyle = lettering.captionFill;
      ctx.strokeStyle = lettering.captionInk;
      ctx.lineWidth = 3;
      ctx.fillRect(item.x, item.y, item.w, item.h);
      ctx.strokeRect(item.x, item.y, item.w, item.h);
      ctx.fillStyle = lettering.captionInk;
      drawTextLines(ctx, item.block, item.x + item.pad, item.y + item.pad, "left");
    } else {
      drawBalloon(ctx, item, "#111111");
    }
  }
}

/** Where every caption and balloon on a page ends up, in page pixels (for drag handles). */
export function letteringBoxes(ctx: CanvasRenderingContext2D, page: Page, style: ComicStyle, fonts: RenderFonts): LetteringBox[] {
  return pageBoxes(page).flatMap((box, panel) =>
    page.panels[panel]
      ? panelLettering(ctx, page.panels[panel], box, style.lettering, fonts).map((item) => ({
          panel,
          ref: item.type === "caption" ? ("caption" as const) : item.index,
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
  options: { wireframe?: { names: string[]; stageLabels?: Record<string, string> } } = {},
): void {
  const { lettering } = style;
  const dark = !options.wireframe && isDark(lettering.pageColor);
  ctx.fillStyle = options.wireframe ? "#ffffff" : lettering.pageColor;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  const boxes = pageBoxes(page);

  // Pass 1: artwork, clipped to each panel.
  boxes.forEach((box, i) => {
    const panel = page.panels[i];
    if (!panel) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    const image = images[i];
    if (options.wireframe) {
      drawWireframe(ctx, panel, box, options.wireframe.names, fonts, options.wireframe.stageLabels);
    } else if (image) {
      drawCoverFit(ctx, image, box);
    } else {
      ctx.fillStyle = dark ? "#262626" : "#ece8df";
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    ctx.restore();
    ctx.strokeStyle = dark ? "#e5e5e5" : "#111111";
    ctx.lineWidth = options.wireframe ? 3 : 5;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  });

  // Pass 2: lettering on top of everything, so a balloon the user moved can cross a panel border.
  boxes.forEach((box, i) => {
    const panel = page.panels[i];
    if (panel) drawLettering(ctx, panelLettering(ctx, panel, box, lettering, fonts), lettering);
  });

  ctx.fillStyle = dark ? "#a3a3a3" : "#555555";
  ctx.font = `700 24px ${fonts.comic}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(pageNumber), PAGE_W / 2, PAGE_H - MARGIN / 2);
}

/** Draws the front cover: full-bleed art, big title, tagline. */
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

  // Publisher badge.
  ctx.fillStyle = "#facc15";
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 5;
  ctx.fillRect(56, 56, 250, 76);
  ctx.strokeRect(56, 56, 250, 76);
  ctx.fillStyle = "#111111";
  ctx.font = `52px ${fonts.title}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("COMIC.ME", 56 + 125, 56 + 40);

  const design = script.cover?.design;
  const family = design ? fonts.cover[design.titleFont] : fonts.title;
  const weight = design && ["playfair", "cinzel"].includes(design.titleFont) ? 900 : 400;
  const keepCase = design?.titleFont === "playfair";
  const fill = design?.titleFill ?? "#facc15";
  const outline = design?.titleOutline ?? "#111111";
  const atBottom = design?.titlePosition === "bottom";

  // Title: as big as fits, up to three lines.
  const title = keepCase ? script.title : script.title.toUpperCase();
  let size = 230;
  let lines: string[] = [];
  for (; size >= 90; size -= 10) {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = wrapText(ctx, title, PAGE_W - 160);
    if (lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= PAGE_W - 160)) break;
  }
  const lineHeight = size * 0.98;
  const blockHeight = lines.length * lineHeight;
  const titleTop = atBottom ? PAGE_H - 130 - blockHeight : 175;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  lines.forEach((line, i) => {
    const y = titleTop + i * lineHeight;
    // Soft drop shadow, a bold outline, then the fill: reads over any artwork.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.04;
    ctx.strokeStyle = outline;
    ctx.lineWidth = size * (design ? 0.07 : 0.09);
    ctx.strokeText(line, PAGE_W / 2, y);
    ctx.restore();
    ctx.fillStyle = fill;
    ctx.fillText(line, PAGE_W / 2, y);
  });

  if (!script.tagline.trim()) return;
  if (design) {
    // An understated tagline, like a film poster: just above the title at the bottom, or at the foot of the page.
    ctx.font = `700 40px ${fonts.comic}`;
    const taglineLines = wrapText(ctx, script.tagline.toUpperCase(), PAGE_W - 300);
    const taglineTop = atBottom ? titleTop - 30 - taglineLines.length * 48 : PAGE_H - 110 - taglineLines.length * 48;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    taglineLines.forEach((line, i) => ctx.fillText(line, PAGE_W / 2, taglineTop + i * 48));
    ctx.restore();
    return;
  }

  // Tagline box near the bottom (comics made before cover designs existed).
  const block = textBlock(ctx, script.tagline.toUpperCase(), fonts.comic, 700, 44, PAGE_W - 360);
  const pad = 24;
  const w = block.width + pad * 2;
  const h = block.height + pad * 2;
  const x = (PAGE_W - w) / 2;
  const y = PAGE_H - 120 - h;
  ctx.fillStyle = style.lettering.captionFill;
  ctx.strokeStyle = style.lettering.captionInk;
  ctx.lineWidth = 5;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = style.lettering.captionInk;
  drawTextLines(ctx, block, PAGE_W / 2, y + pad, "center");
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
    drawPage(ctx, page, source.index + 1, images, style, fonts);
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
