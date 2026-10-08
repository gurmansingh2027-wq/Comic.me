"use client";

import { useEffect, useRef, useState } from "react";
import type { LetterPos, Page } from "@/lib/comic";
import {
  createPageCanvas,
  drawPage,
  ensureFontsLoaded,
  letteringBoxes,
  PAGE_H,
  PAGE_W,
  type LetteringBox,
} from "@/lib/engines/render";
import { renderFonts } from "@/lib/fonts";
import type { ComicStyle } from "@/lib/styles";

export type LetterRef = { panel: number; ref: "caption" | number };

type Props = {
  page: Page;
  pageNumber: number;
  style: ComicStyle;
  names: string[];
  /** "Name|stageId" → stage label, to label stick figures with their age. */
  stageLabels?: Record<string, string>;
  /** Real artwork per panel; without it, panels are drawn as stick-figure wireframes. */
  images?: (HTMLImageElement | null)[];
  selected?: LetterRef | null;
  onSelect: (ref: LetterRef) => void;
  /** Called when the user drops or resizes a caption/balloon. `null` puts it back on auto. */
  onMove: (ref: LetterRef, pos: LetterPos | null) => void;
  /** Extra content drawn over the page (e.g. "Redraw" buttons). */
  children?: React.ReactNode;
};

type Drag = { box: LetteringBox; mode: "move" | "resize"; startX: number; startY: number; dx: number; dy: number; dw: number };

/** A comic page you can rearrange: drag captions and balloons anywhere, drag the corner to resize. */
export default function WireframePage({ page, pageNumber, style, names, stageLabels, images, selected, onSelect, onMove, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<LetteringBox[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureFontsLoaded(renderFonts).then(() => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const buffer = createPageCanvas();
      const ctx = buffer.getContext("2d")!;
      drawPage(ctx, page, pageNumber, images ?? [], style, renderFonts, images ? {} : { wireframe: { names, stageLabels } });
      canvas.getContext("2d")!.drawImage(buffer, 0, 0);
      setBoxes(letteringBoxes(ctx, page, style, renderFonts));
    });
    return () => {
      cancelled = true;
    };
  }, [page, pageNumber, style, names, stageLabels, images]);

  /** Converts a pointer movement on screen into page pixels. */
  function scale() {
    const width = frameRef.current?.getBoundingClientRect().width ?? PAGE_W;
    return PAGE_W / width;
  }

  function start(event: React.PointerEvent, box: LetteringBox, mode: Drag["mode"]) {
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({ box, mode, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, dw: 0 });
  }

  function move(event: React.PointerEvent) {
    if (!drag) return;
    const k = scale();
    const dx = (event.clientX - drag.startX) * k;
    const dy = (event.clientY - drag.startY) * k;
    setDrag(drag.mode === "move" ? { ...drag, dx, dy } : { ...drag, dw: dx });
  }

  function end() {
    if (!drag) return;
    const { box, dx, dy, dw } = drag;
    setDrag(null);
    // A click (no movement) jumps to the text box for editing; a drag moves or resizes.
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && Math.abs(dw) < 3) {
      onSelect({ panel: box.panel, ref: box.ref });
      return;
    }
    const width = Math.max(120, box.w + dw);
    onMove(
      { panel: box.panel, ref: box.ref },
      {
        x: Math.min(Math.max(box.x + dx, -width * 0.5), PAGE_W - 40) / PAGE_W,
        y: Math.min(Math.max(box.y + dy, 0), PAGE_H - 40) / PAGE_H,
        w: Math.min(width, PAGE_W) / PAGE_W,
      },
    );
  }

  const pct = (value: number, total: number) => `${(value / total) * 100}%`;

  return (
    <div ref={frameRef} className="comic-box relative bg-white select-none" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <canvas ref={canvasRef} width={PAGE_W} height={PAGE_H} className="block h-auto w-full" aria-label={`Page ${pageNumber}`} />
      {children}
      {boxes.map((box) => {
        const isDragging = drag && drag.box.panel === box.panel && drag.box.ref === box.ref;
        const isSelected = selected?.panel === box.panel && selected.ref === box.ref;
        const x = box.x + (isDragging && drag.mode === "move" ? drag.dx : 0);
        const y = box.y + (isDragging && drag.mode === "move" ? drag.dy : 0);
        const w = box.w + (isDragging && drag.mode === "resize" ? drag.dw : 0);
        return (
          <div
            key={`${box.panel}-${box.ref}`}
            role="button"
            tabIndex={0}
            aria-label={box.ref === "caption" ? `Caption, panel ${box.panel + 1}` : `Balloon ${Number(box.ref) + 1}, panel ${box.panel + 1}`}
            title="Drag to move · drag the corner to resize · click to edit the text"
            onPointerDown={(event) => start(event, box, "move")}
            onKeyDown={(event) => event.key === "Enter" && onSelect({ panel: box.panel, ref: box.ref })}
            className={`absolute cursor-move rounded border-2 ${isSelected || isDragging ? "border-zap bg-zap/10" : "border-transparent hover:border-dashed hover:border-zap"}`}
            style={{ left: pct(x, PAGE_W), top: pct(y, PAGE_H), width: pct(w, PAGE_W), height: pct(box.h, PAGE_H) }}
          >
            {(isSelected || isDragging) && (
              <span
                onPointerDown={(event) => start(event, box, "resize")}
                className="absolute -right-2 -bottom-2 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-white bg-zap"
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
