import { notFound, redirect } from "next/navigation";
import ComicViewer from "@/components/ComicViewer";
import Stepper from "@/components/Stepper";
import { imageKeys } from "@/lib/comic";
import { isStale } from "@/lib/pipeline";
import { hasImage, loadComic } from "@/lib/storage";

export async function generateMetadata(props: PageProps<"/comic/[id]">) {
  const { id } = await props.params;
  const comic = await loadComic(id);
  return { title: comic?.script ? `${comic.script.title} — Comic.me` : "Your comic — Comic.me" };
}

export default async function ComicPage(props: PageProps<"/comic/[id]">) {
  const { id } = await props.params;
  const comic = await loadComic(id);
  if (!comic) notFound();
  if (comic.status === "draft") redirect(`/comic/${id}/characters`);
  if (comic.status === "ready" && comic.stage === "storyboard") redirect(`/comic/${id}/storyboard`);

  const stale = isStale(comic);
  const ready = comic.status === "ready" && comic.script;
  const keys = ready ? imageKeys(comic.script!) : [];
  const drawn = await Promise.all(keys.map((key) => hasImage(id, key)));

  return (
    <div className="space-y-8">
      <Stepper current="Your comic" />
      <ComicViewer
        comicId={comic.id}
        styleId={comic.styleId}
        initialStatus={stale ? "failed" : comic.status}
        initialError={stale ? "Writing was interrupted. Please try again." : comic.error}
        initialSince={comic.updatedAt}
        initialScript={ready ? comic.script : undefined}
        alreadyDrawn={keys.filter((_, i) => drawn[i])}
      />
    </div>
  );
}
