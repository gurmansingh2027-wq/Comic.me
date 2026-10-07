"use client";

import { useEffect, useRef, useState } from "react";
import type { ComicScript } from "@/lib/comic";
import {
  createPageCanvas,
  drawCover,
  drawPage,
  ensureFontsLoaded,
  PAGE_H,
  PAGE_W,
  pageBoxes,
} from "@/lib/engines/render";
import { renderFonts } from "@/lib/fonts";
import type { ComicStyle } from "@/lib/styles";
import Countdown, { ESTIMATES } from "./Countdown";

export type ImageStatus = "waiting" | "drawing" | "ready" | "error";

type Props = {
  script: ComicScript;
  style: ComicStyle;
  /** "cover", or the page index (0-based). */
  which: "cover" | number;
  keys: string[];
  images: (HTMLImageElement | null)[];
  statuses: ImageStatus[];
  /** When each picture started drawing (ms), for its countdown. */
  drawingSince?: (number | undefined)[];
  errors: (string | undefined)[];
  onRetry: (key: string) => void;
  onSave?: () => void;
  /** Redraw this picture with a requested change (used for the cover). */
  onRedraw?: (feedback: string) => void;
};

export default function ComicPageCanvas({ script, style, which, keys, images, statuses, drawingSince = [], errors, onRetry, onSave, onRedraw }: Props) {
  const [redrawing, setRedrawing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isCover = which === "cover";
  const page = isCover ? null : script.pages[which];

  useEffect(() => {
    let cancelled = false;
    ensureFontsLoaded(renderFonts).then(() => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      // Draw off-screen first so the visible page never flickers.
      const buffer = createPageCanvas();
      const ctx = buffer.getContext("2d")!;
      if (page) drawPage(ctx, page, (which as number) + 1, images, style, renderFonts);
      else drawCover(ctx, script, images[0], style, renderFonts);
      canvas.getContext("2d")!.drawImage(buffer, 0, 0);
    });
    return () => {
      cancelled = true;
    };
  }, [script, style, page, which, images]);

  const boxes = page ? pageBoxes(page) : [{ x: 0, y: 0, w: PAGE_W, h: PAGE_H }];
  const allReady = statuses.every((status) => status === "ready");
  const label = isCover ? "Cover" : `Page ${(which as number) + 1}`;

  return (
    <figure className="space-y-2">
      <div className="comic-box relative bg-white">
        <canvas
          ref={canvasRef}
          width={PAGE_W}
          height={PAGE_H}
          role="img"
          aria-label={label}
          className="block h-auto w-full"
        />
        {boxes.map((box, i) =>
          statuses[i] === "ready" ? null : (
            <div
              key={keys[i]}
              className="absolute flex flex-col items-center justify-center gap-2 p-2 text-center"
              style={{
                left: `${(box.x / PAGE_W) * 100}%`,
                top: `${(box.y / PAGE_H) * 100}%`,
                width: `${(box.w / PAGE_W) * 100}%`,
                height: `${(box.h / PAGE_H) * 100}%`,
              }}
            >
              {statuses[i] === "error" ? (
                <div className="rounded border-2 border-ink bg-white/95 p-2 text-xs">
                  <p className="font-bold text-zap">Couldn&apos;t draw this one</p>
                  {errors[i] && <p className="mt-1 line-clamp-3">{errors[i]}</p>}
                  <button
                    type="button"
                    onClick={() => onRetry(keys[i])}
                    className="mt-2 rounded border-2 border-ink bg-pop px-3 py-1 font-bold"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 rounded bg-white/80 px-3 py-2">
                  {statuses[i] === "drawing" ? (
                    <div className="h-6 w-6 animate-spin rounded-full border-3 border-ink border-t-pop" />
                  ) : null}
                  <span className="text-xs font-bold">{statuses[i] === "drawing" ? "Drawing…" : "In the queue"}</span>
                  {statuses[i] === "drawing" && drawingSince[i] && (
                    <Countdown startedAt={drawingSince[i]!} seconds={ESTIMATES.picture} className="text-[11px]" />
                  )}
                </div>
              )}
            </div>
          ),
        )}
      </div>
      {redrawing && onRedraw && (
        <div className="space-y-2 rounded border-3 border-ink bg-pop p-3">
          <p className="text-sm font-bold">Redraw the {label.toLowerCase()}: what should change?</p>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={2}
            maxLength={1000}
            autoFocus
            placeholder="For example: more dramatic, show the whole family, sunset colours"
            className="w-full rounded border-2 border-ink bg-white px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onRedraw(feedback);
                setRedrawing(false);
              }}
              className="rounded border-2 border-ink bg-zap px-3 py-1.5 text-sm font-bold text-white"
            >
              Redraw (about {ESTIMATES.picture} sec)
            </button>
            <button type="button" onClick={() => setRedrawing(false)} className="rounded border-2 border-ink bg-white px-3 py-1.5 text-sm font-bold">
              Cancel
            </button>
          </div>
        </div>
      )}
      <figcaption className="flex items-center justify-between px-1 text-sm text-neutral-600">
        <span>
          {label}
          {onRedraw && allReady && (
            <button type="button" onClick={() => setRedrawing(true)} className="ml-3 font-bold underline hover:text-ink">
              ✏️ Redraw
            </button>
          )}
        </span>
        {allReady && onSave && (
          <button type="button" onClick={onSave} className="font-bold underline hover:text-ink">
            Save as image
          </button>
        )}
      </figcaption>
    </figure>
  );
}
