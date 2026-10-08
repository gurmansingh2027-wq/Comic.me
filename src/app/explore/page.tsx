import Link from "next/link";
import ExploreTile from "@/components/ExploreTile";
import { exploreWall } from "@/lib/explore";

export const metadata = { title: "Explore — Comic.me" };
export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const { tiles } = await exploreWall();
  return (
    <div className="space-y-8">
      <section className="space-y-3 text-center">
        <h1 className="font-title text-5xl tracking-wide sm:text-6xl">Explore</h1>
        <p className="mx-auto max-w-2xl text-lg text-neutral-700">
          Stories people turned into comics. See one you love? <strong>Recreate</strong> its style and format with your own story.
        </p>
      </section>
      {tiles.length === 0 ? (
        <div className="comic-box mx-auto max-w-xl space-y-3 bg-white p-8 text-center">
          <p className="font-bold">Nothing here yet.</p>
          <p className="text-neutral-700">Finish a comic and switch on “Share on Explore” to see it here.</p>
          <Link href="/create" className="inline-block rounded border-2 border-ink bg-pop px-4 py-2 font-bold">Make a comic</Link>
        </div>
      ) : (
        <div className="columns-2 gap-4 md:columns-3 xl:columns-4">
          {tiles.map((tile) => <ExploreTile key={tile.key} tile={tile} />)}
        </div>
      )}
    </div>
  );
}
