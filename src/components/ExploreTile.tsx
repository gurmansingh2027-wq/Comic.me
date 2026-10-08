"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ComicScript } from "@/lib/comic";
import { COPY } from "@/lib/copy";
import { createPageCanvas, drawCover, drawPage, ensureFontsLoaded, loadImage } from "@/lib/engines/render";
import type { ExploreTile as Tile } from "@/lib/explore";
import { renderFonts } from "@/lib/fonts";
import { getStyle } from "@/lib/styles";

/** Covers and pages are drawn by our renderer (real lettering), at half size, once they scroll near. */
function LetteredCanvas({ tile }: { tile: Extract<Tile, { kind: "cover" | "page" }> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && setVisible(true), { rootMargin: "600px" });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const style = getStyle(tile.styleId);
      if (!style) return;
      await ensureFontsLoaded(renderFonts);
      const buffer = createPageCanvas();
      const ctx = buffer.getContext("2d")!;
      if (tile.kind === "cover") {
        const art = await loadImage(tile.src).catch(() => null);
        const script: ComicScript = { title: tile.title, tagline: tile.tagline, bible: null, characters: [], cover: { scene: "", design: tile.design }, pages: [] };
        drawCover(ctx, script, art, style, renderFonts);
      } else {
        const images = await Promise.all(tile.srcs.map((src) => loadImage(src).catch(() => null)));
        drawPage(ctx, tile.page, tile.pageIndex + 1, images, style, renderFonts);
      }
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      canvas.getContext("2d")!.drawImage(buffer, 0, 0, canvas.width, canvas.height);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, tile]);

  return <canvas ref={canvasRef} width={800} height={1200} className="block h-full w-full object-cover" aria-hidden />;
}

/** One piece of art on the Explore wall. Art first; on hover it darkens and shows the title, style and Recreate. */
export default function ExploreTile({ tile, style, size = "full" }: { tile: Tile; style?: CSSProperties; /** Small tiles show less on hover, so it always fits. */ size?: "full" | "small" | "tiny" }) {
  return (
    <div className="group absolute overflow-hidden rounded-[3px] bg-neutral-900" style={style}>
      <Link href={`/explore/${tile.comicId}`} className="block h-full w-full" aria-label={`${tile.title}, ${tile.styleLabel}`}>
        {tile.kind === "panel" ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated comic art served by our API
          <img src={tile.src} alt="" loading="lazy" className="block h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        ) : (
          <LetteredCanvas tile={tile} />
        )}
      </Link>
      <div className="pointer-events-none absolute inset-0 bg-black/0 transition duration-300 group-hover:bg-black/50 group-focus-within:bg-black/50" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 max-h-full translate-y-1 overflow-hidden p-3 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <p className={`line-clamp-2 font-title leading-none tracking-wide text-white ${size === "full" ? "text-xl sm:text-2xl" : "text-base"}`}>{tile.title}</p>
        {size !== "tiny" && <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.25em] text-white/70">{tile.styleLabel}</p>}
        {size === "full" && tile.descriptor && <p className="mt-1 line-clamp-1 text-xs text-white/80">{tile.descriptor}</p>}
        <Link
          href={`/create?preset=${tile.comicId}`}
          className={`pointer-events-auto inline-flex items-center rounded-full bg-pop font-bold text-ink transition hover:bg-white ${size === "tiny" ? "mt-1 px-2 py-0.5 text-[10px]" : "mt-2 px-3 py-1 text-xs"}`}
        >
          {COPY.explore.recreate}
        </Link>
      </div>
    </div>
  );
}
