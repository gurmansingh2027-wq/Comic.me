"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExploreTile as Tile } from "@/lib/explore";
import ExploreTile from "./ExploreTile";

const GAP = 6;

type Placed = { tile: Tile; left: number; top: number; width: number; height: number };

function columnsFor(width: number): number {
  if (width < 560) return 2;
  if (width < 960) return 3;
  if (width < 1400) return 4;
  return 5;
}

/**
 * Dense masonry: every tile keeps its own shape (tall covers, wide panels, square beats), some
 * span two columns, and each one drops into the shortest gap, so the wall reads as one visual
 * surface rather than a grid of cards.
 */
function masonry(tiles: Tile[], width: number): { items: Placed[]; height: number } {
  if (width <= 0) return { items: [], height: 0 };
  const cols = columnsFor(width);
  const colW = (width - GAP * (cols - 1)) / cols;
  const heights = new Array(cols).fill(0);
  const items: Placed[] = [];
  let featuredCovers = 0;
  tiles.forEach((tile, index) => {
    const bigCover = tile.kind === "cover" && cols >= 4 && index % 9 === 4 && featuredCovers < 3;
    const span = cols >= 3 && (tile.feature || bigCover) ? 2 : 1;
    if (bigCover) featuredCovers++;
    const w = span * colW + (span - 1) * GAP;
    const h = Math.round(w / tile.aspect);
    let best = 0;
    let bestTop = Infinity;
    let bestSpread = Infinity;
    for (let c = 0; c <= cols - span; c++) {
      const slice = heights.slice(c, c + span);
      const top = Math.max(...slice);
      const spread = top - Math.min(...slice);
      if (top < bestTop - 1 || (Math.abs(top - bestTop) <= 1 && spread < bestSpread)) {
        best = c;
        bestTop = top;
        bestSpread = spread;
      }
    }
    items.push({ tile, left: best * (colW + GAP), top: bestTop, width: w, height: h });
    for (let c = best; c < best + span; c++) heights[c] = bestTop + h + GAP;
  });
  return { items, height: Math.max(...heights) };
}

/**
 * The wall. With `nextOffset`, more tiles load from /api/explore as you scroll (infinite scroll);
 * new tiles are appended, so the ones already on screen never move.
 */
export default function ExploreWall({ tiles: initialTiles, nextOffset: initialNext = null }: { tiles: Tile[]; nextOffset?: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [tiles, setTiles] = useState(initialTiles);
  const [nextOffset, setNextOffset] = useState<number | null>(initialNext);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || nextOffset === null || loading || failed) return;
    const observer = new IntersectionObserver(
      async (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setLoading(true);
        try {
          const response = await fetch(`/api/explore?offset=${nextOffset}&limit=30`, { cache: "no-store" });
          if (!response.ok) throw new Error();
          const data = (await response.json()) as { tiles: Tile[]; nextOffset: number | null };
          setTiles((current) => [...current, ...data.tiles.filter((tile) => !current.some((c) => c.key === tile.key))]);
          setNextOffset(data.nextOffset);
        } catch {
          setFailed(true);
        } finally {
          setLoading(false);
        }
      },
      { rootMargin: "1200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [nextOffset, loading, failed]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  const layout = useMemo(() => masonry(tiles, width), [tiles, width]);

  return (
    <>
      <div ref={ref} className="relative w-full" style={{ height: layout.height || "100vh" }}>
        {layout.items.map((item) => (
          <ExploreTile
            key={item.tile.key}
            tile={item.tile}
            size={item.height < 150 || item.width < 150 ? "tiny" : item.height < 230 ? "small" : "full"}
            style={{ left: item.left, top: item.top, width: item.width, height: item.height }}
          />
        ))}
      </div>
      <div ref={sentinel} aria-hidden className="h-px" />
      {(loading || failed) && (
        <p className="py-6 text-center text-sm text-white/50">
          {failed ? (
            <button type="button" onClick={() => setFailed(false)} className="underline">
              Couldn&apos;t load more. Try again
            </button>
          ) : (
            "Inking more…"
          )}
        </p>
      )}
    </>
  );
}
