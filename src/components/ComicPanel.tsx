"use client";

import { useEffect, useRef } from "react";
import type { Panel } from "@/lib/comic";
import { drawPanel, ensureFontsLoaded, loadImage, PANEL_PX } from "@/lib/engines/render";
import { renderFonts } from "@/lib/fonts";

export type PanelStatus = "drawing" | "ready" | "error";

type Props = {
  number: number;
  panel: Panel;
  imageUrl: string;
  status: PanelStatus;
  error?: string;
  onRetry: () => void;
};

export default function ComicPanel({ number, panel, imageUrl, status, error, onRetry }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    (async () => {
      await ensureFontsLoaded(renderFonts);
      const image = await loadImage(imageUrl);
      const ctx = canvasRef.current?.getContext("2d");
      if (!cancelled && ctx) drawPanel(ctx, image, panel, 0, 0, PANEL_PX, renderFonts);
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [status, imageUrl, panel]);

  if (status === "ready") {
    const description = [panel.caption, ...panel.dialogue.map((line) => `${line.speaker}: “${line.text}”`)]
      .filter(Boolean)
      .join(" ");
    return (
      <canvas
        ref={canvasRef}
        width={PANEL_PX}
        height={PANEL_PX}
        role="img"
        aria-label={`Panel ${number}. ${description}`}
        className="comic-box aspect-square h-auto w-full bg-white"
      />
    );
  }

  return (
    <div className="comic-box flex aspect-square w-full flex-col items-center justify-center gap-3 bg-white p-6 text-center">
      {status === "drawing" ? (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-ink border-t-pop" />
          <p className="font-title text-2xl tracking-wide">Drawing panel {number}…</p>
          <p className="line-clamp-4 text-sm text-neutral-600">{panel.scene}</p>
        </>
      ) : (
        <>
          <p className="font-title text-2xl tracking-wide text-zap">Panel {number} didn&apos;t work</p>
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded border-2 border-ink bg-pop px-4 py-2 font-bold hover:-translate-y-0.5"
          >
            Try again
          </button>
        </>
      )}
    </div>
  );
}
