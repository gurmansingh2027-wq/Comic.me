import Link from "next/link";
import { notFound } from "next/navigation";
import ExploreTile from "@/components/ExploreTile";
import { explorableComic } from "@/lib/explore";
import { loadComic } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/explore/[id]">) {
  const { id } = await props.params;
  const comic = await loadComic(id);
  return { title: comic?.explore?.published && comic.script ? `${comic.script.title} — Explore Comic.me` : "Explore — Comic.me" };
}

export default async function ExploreComicPage(props: PageProps<"/explore/[id]">) {
  const { id } = await props.params;
  const comic = await loadComic(id);
  const item = comic ? await explorableComic(comic, 6) : null;
  if (!item) notFound();
  const [cover, ...panels] = item.tiles;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-4">
        <ExploreTile tile={cover} />
        <Link href="/explore" className="text-sm underline">← Back to Explore</Link>
      </div>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-title text-5xl tracking-wide">{item.title}</h1>
          {item.tagline && <p className="text-lg text-neutral-700">{item.tagline}</p>}
          <div className="flex flex-wrap gap-2 text-sm font-bold">
            <span className="rounded-full border-2 border-ink bg-white px-3 py-1">{item.styleLabel}</span>
            <span className="rounded-full border-2 border-ink bg-white px-3 py-1">{item.pageCount} pages · {item.panelCount} panels</span>
            {item.coverApproach && <span className="rounded-full border-2 border-ink bg-white px-3 py-1">Cover: {item.coverApproach.replace(/-/g, " ")}</span>}
          </div>
        </div>
        <div className="comic-box space-y-3 bg-pop p-5">
          <p className="font-title text-3xl tracking-wide">Make one like this, about you</p>
          <p className="text-sm">
            Recreate copies this comic&apos;s <strong>style, page structure, pacing and cover direction</strong>. Your story, your people and
            your photos stay yours: nothing from this comic&apos;s story is copied.
          </p>
          <Link href={`/create?preset=${item.id}`} className="comic-box inline-block bg-zap px-6 py-3 font-title text-2xl tracking-wide text-white">
            ✨ Recreate with my story
          </Link>
        </div>
        {panels.length > 0 && (
          <div className="columns-2 gap-4">
            {panels.map((tile) => <ExploreTile key={tile.key} tile={tile} />)}
          </div>
        )}
      </div>
    </div>
  );
}
