// Render Engine (runs in the browser): draws our own captions and speech bubbles
// on top of the panel artwork, and builds the downloadable comic page.
// The same drawing code is used on screen and in the download, so they always match.

import type { ComicScript, Panel } from "../comic";

export type RenderFonts = {
  /** CSS font-family for the comic title */
  title: string;
  /** CSS font-family for captions and bubbles */
  text: string;
};

export const PANEL_PX = 1024;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

export async function ensureFontsLoaded(fonts: RenderFonts): Promise<void> {
  await Promise.all([document.fonts.load(`700 34px ${fonts.text}`), document.fonts.load(`96px ${fonts.title}`)]);
}

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

function widest(ctx: CanvasRenderingContext2D, lines: string[]): number {
  return Math.max(0, ...lines.map((line) => ctx.measureText(line).width));
}

/** Draws one panel (art + caption + bubbles) into a size×size square at (x, y). */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  panel: Panel,
  x: number,
  y: number,
  size: number,
  fonts: RenderFonts,
): void {
  const u = size / PANEL_PX;
  const pad = 28 * u;
  const stroke = 4 * u;
  let cursorY = y + pad;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";

  // Narrator caption: yellow box, top-left.
  if (panel.caption.trim()) {
    const fontSize = 28 * u;
    const lineHeight = 34 * u;
    const boxPad = 14 * u;
    ctx.font = `700 ${fontSize}px ${fonts.text}`;
    const lines = wrapText(ctx, panel.caption.toUpperCase(), size * 0.62);
    const w = widest(ctx, lines) + boxPad * 2;
    const h = lines.length * lineHeight + boxPad * 2 - (lineHeight - fontSize);
    const bx = x + pad;

    ctx.fillStyle = "#fde68a";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = stroke;
    ctx.fillRect(bx, cursorY, w, h);
    ctx.strokeRect(bx, cursorY, w, h);
    ctx.fillStyle = "#111";
    ctx.textAlign = "left";
    lines.forEach((line, i) => ctx.fillText(line, bx + boxPad, cursorY + boxPad + i * lineHeight));
    cursorY += h + 18 * u;
  }

  // Speech bubbles: stacked top-down, each pinned to its speaker's side with a tail pointing at them.
  for (const line of panel.dialogue) {
    const fontSize = 32 * u;
    const lineHeight = 38 * u;
    const padX = 26 * u;
    const padY = 18 * u;
    const tailH = 40 * u;
    ctx.font = `700 ${fontSize}px ${fonts.text}`;
    const lines = wrapText(ctx, line.text, size * 0.5);
    const w = widest(ctx, lines) + padX * 2;
    const h = lines.length * lineHeight + padY * 2 - (lineHeight - fontSize);
    const left = line.side === "left";
    const bx = left ? x + pad : x + size - pad - w;
    const by = cursorY;
    const radius = Math.min(h / 2, 44 * u);

    const baseCenter = bx + w * (left ? 0.3 : 0.7);
    const baseHalf = 16 * u;
    const tipX = baseCenter + (left ? -22 : 22) * u;
    const tipY = by + h + tailH;
    const tail = (inset: number) => {
      ctx.beginPath();
      ctx.moveTo(baseCenter - baseHalf + inset, by + h - inset);
      ctx.lineTo(tipX, tipY - inset);
      ctx.lineTo(baseCenter + baseHalf - inset, by + h - inset);
      ctx.closePath();
    };

    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = stroke;
    tail(0);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, radius);
    ctx.fill();
    ctx.stroke();
    tail(stroke * 0.75); // hide the bubble outline where the tail joins it
    ctx.fill();

    ctx.fillStyle = "#111";
    ctx.textAlign = "center";
    lines.forEach((text, i) => ctx.fillText(text, bx + w / 2, by + padY + i * lineHeight));
    cursorY = tipY + 10 * u;
  }

  ctx.restore();

  ctx.strokeStyle = "#111";
  ctx.lineWidth = 6 * u;
  ctx.strokeRect(x, y, size, size);
}

/** Builds the full comic page (title + 2×3 grid of panels) as a canvas. */
export function drawComicPage(script: ComicScript, images: CanvasImageSource[], fonts: RenderFonts): HTMLCanvasElement {
  const margin = 56;
  const gutter = 32;
  const titleHeight = 170;
  const footerHeight = 64;
  const cols = 2;
  const rows = Math.ceil(images.length / cols);

  const canvas = document.createElement("canvas");
  canvas.width = margin * 2 + cols * PANEL_PX + (cols - 1) * gutter;
  canvas.height = margin * 2 + titleHeight + rows * PANEL_PX + (rows - 1) * gutter + footerHeight;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `110px ${fonts.title}`;
  ctx.fillStyle = "#facc15";
  ctx.fillText(script.title, canvas.width / 2 + 6, margin + titleHeight / 2 - 10 + 6);
  ctx.fillStyle = "#111";
  ctx.fillText(script.title, canvas.width / 2, margin + titleHeight / 2 - 10);

  images.forEach((image, i) => {
    const x = margin + (i % cols) * (PANEL_PX + gutter);
    const y = margin + titleHeight + Math.floor(i / cols) * (PANEL_PX + gutter);
    drawPanel(ctx, image, script.panels[i], x, y, PANEL_PX, fonts);
  });

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = `700 30px ${fonts.text}`;
  ctx.fillStyle = "#555";
  ctx.fillText("Made with Comic.me", canvas.width - margin, canvas.height - margin - footerHeight / 2);

  return canvas;
}

export async function downloadComic(script: ComicScript, imageUrls: string[], fonts: RenderFonts): Promise<void> {
  await ensureFontsLoaded(fonts);
  const images = await Promise.all(imageUrls.map(loadImage));
  const canvas = drawComicPage(script, images, fonts);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create the image file.");

  const slug = script.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "comic";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `comic-me-${slug}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
