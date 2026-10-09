import Link from "next/link";
import ExploreWall from "@/components/ExploreWall";
import { COPY } from "@/lib/copy";
import { exploreWall } from "@/lib/explore";

export const metadata = { title: "Explore — Comic.me" };
export const dynamic = "force-dynamic";

/** Tiles in the first page; the rest load as you scroll. */
const PAGE_SIZE = 30;

export default async function ExplorePage() {
  const { comics, tiles } = await exploreWall();
  return (
    // Full-bleed and dark, so the art is the whole page.
    <div className="relative left-1/2 -my-10 w-screen -translate-x-1/2 bg-[#0b0b0b] px-1.5 pt-4 pb-10 text-white">
      <div className="flex flex-wrap items-end justify-between gap-3 px-2 pb-4">
        <div>
          <h1 className="font-title text-4xl leading-none tracking-wide">{COPY.explore.title}</h1>
          <p className="mt-1 text-sm text-white/60">{COPY.explore.intro}</p>
        </div>
        <p className="text-xs text-white/40">
          {tiles.length} pieces from {comics.length} stories
        </p>
      </div>
      {tiles.length === 0 ? (
        <div className="mx-auto max-w-md space-y-3 py-24 text-center">
          <p className="text-white/70">{COPY.explore.empty}</p>
          <Link href="/create" className="inline-block rounded-full bg-pop px-4 py-2 font-bold text-ink">
            Make a comic
          </Link>
        </div>
      ) : (
        <ExploreWall tiles={tiles.slice(0, PAGE_SIZE)} nextOffset={tiles.length > PAGE_SIZE ? PAGE_SIZE : null} />
      )}
    </div>
  );
}
