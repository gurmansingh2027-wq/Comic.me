import { notFound, redirect } from "next/navigation";
import CharacterStudio from "@/components/CharacterStudio";
import { castService } from "@/lib/cast-service";
import { loadComic } from "@/lib/storage";

export const metadata = { title: "Meet your characters — Comic.me" };

export default async function CharactersPage(props: PageProps<"/comic/[id]/characters">) {
  const { id } = await props.params;
  const comic = await loadComic(id);
  if (!comic) notFound();
  if (comic.status !== "draft") redirect(`/comic/${id}`);
  return <CharacterStudio comicId={id} styleId={comic.styleId} initialState={await castService.read(id)} />;
}
