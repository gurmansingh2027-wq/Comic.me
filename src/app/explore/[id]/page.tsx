import Link from "next/link";
import { notFound } from "next/navigation";
import ExploreWall from "@/components/ExploreWall";
import { onExplore } from "@/lib/comic";
import { explorableComic } from "@/lib/explore";
import { loadComic } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/explore/[id]">) {
  const { id } = await props.params;
  const comic = await loadComic(id);
  return { title: comic && onExplore(comic) && comic.script ? `${comic.script.title} — Explore Comic.me` : "Explore — Comic.me" };
}

export default async function ExploreComicPage(props: PageProps<"/explore/[id]">) {
  const { id } = await props.params;
  const comic = await loadComic(id);
  const item = comic ? await explorableComic(comic, 12) : null;
  if (!item) notFound();

  return (
    <div className="relative left-1/2 -my-10 w-screen -translate-x-1/2 bg-[#0b0b0b] px-1.5 pt-6 pb-10 text-white">
      <div className="flex flex-wrap items-end justify-between gap-4 px-2 pb-5">
        <div className="space-y-2">
          <Link href="/explore" className="text-xs text-white/50 hover:text-white">
            ← Explore
          </Link>
          <h1 className="font-title text-5xl leading-none tracking-wide">{item.title}</h1>
          {item.tagline && <p className="text-white/70">{item.tagline}</p>}
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
            {item.styleLabel} · {item.pageCount} pages · {item.panelCount} panels
            {item.coverApproach && ` · ${item.coverApproach.replace(/-/g, " ")} cover`}
          </p>
        </div>
        <div className="max-w-sm space-y-2 text-right">
          <Link href={`/create?preset=${item.id}`} className="inline-block rounded-full bg-pop px-6 py-3 font-title text-2xl tracking-wide text-ink hover:bg-white">
            Recreate with my story →
          </Link>
          <p className="text-xs text-white/50">
            Borrows the style, page rhythm, pacing, cover and lettering approach. Never the story, names, dialogue or photos.
          </p>
        </div>
      </div>
      <ExploreWall tiles={item.tiles} />
    </div>
  );
}
