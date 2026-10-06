import { notFound } from "next/navigation";
import ComicViewer from "@/components/ComicViewer";
import { hasPanelImage, loadComic } from "@/lib/storage";

export async function generateMetadata(props: PageProps<"/comic/[id]">) {
  const { id } = await props.params;
  const comic = await loadComic(id);
  return { title: comic ? `${comic.script.title} — Comic.me` : "Comic not found — Comic.me" };
}

export default async function ComicPage(props: PageProps<"/comic/[id]">) {
  const { id } = await props.params;
  const comic = await loadComic(id);
  if (!comic) notFound();

  const initiallyReady = await Promise.all(comic.script.panels.map((_, i) => hasPanelImage(id, i + 1)));

  return <ComicViewer comicId={comic.id} script={comic.script} initiallyReady={initiallyReady} />;
}
