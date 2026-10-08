import Link from "next/link";
import type { ExploreTile as Tile } from "@/lib/explore";

const TITLE_FONTS: Record<string, string> = {
  bangers: "var(--font-title)",
  bebas: "var(--font-bebas)",
  playfair: "var(--font-playfair)",
  marker: "var(--font-marker)",
  abril: "var(--font-abril)",
  cinzel: "var(--font-cinzel)",
};

/** One picture on the Explore wall: art first; title, style and Recreate appear on hover. */
export default function ExploreTile({ tile }: { tile: Tile }) {
  return (
    <div className="group relative mb-4 break-inside-avoid overflow-hidden rounded-lg border-3 border-ink bg-ink shadow-[4px_4px_0_#111]">
      <Link href={`/explore/${tile.comicId}`} className="block" aria-label={`${tile.title}, ${tile.styleLabel}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated comic art served by our API */}
        <img src={tile.src} alt="" loading="lazy" className="block w-full object-cover transition duration-300 group-hover:scale-[1.03]" style={{ aspectRatio: tile.aspect }} />
        {tile.kind === "cover" && (
          <span
            className={`pointer-events-none absolute inset-x-3 text-center text-3xl leading-none font-black uppercase sm:text-4xl ${tile.titlePosition === "bottom" ? "bottom-4" : "top-4"}`}
            style={{
              fontFamily: TITLE_FONTS[tile.titleFont ?? "bangers"],
              color: tile.titleFill,
              WebkitTextStroke: `1.5px ${tile.titleOutline}`,
              textShadow: "0 3px 10px rgba(0,0,0,.55)",
            }}
          >
            {tile.title}
          </span>
        )}
      </Link>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 items-end justify-between gap-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-10 opacity-0 transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="min-w-0 text-white">
          <p className="truncate font-title text-xl tracking-wide">{tile.title}</p>
          <p className="text-xs opacity-80">{tile.styleLabel}</p>
        </div>
        <Link
          href={`/create?preset=${tile.comicId}`}
          className="pointer-events-auto shrink-0 rounded-full border-2 border-ink bg-pop px-3 py-1.5 text-sm font-bold text-ink hover:-translate-y-0.5"
        >
          ✨ Recreate
        </Link>
      </div>
    </div>
  );
}
