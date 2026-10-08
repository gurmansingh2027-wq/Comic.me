import { notFound, redirect } from "next/navigation";
import StoryboardEditor from "@/components/StoryboardEditor";
import { picturePricing } from "@/lib/costs";
import { IMAGE_MODEL, imageQuality } from "@/lib/engines/art";
import { loadComic } from "@/lib/storage";

export const metadata = { title: "Your storyboard — Comic.me" };

export default async function StoryboardPage(props: PageProps<"/comic/[id]/storyboard">) {
  const { id } = await props.params;
  const comic = await loadComic(id);
  if (!comic) notFound();
  if (comic.status === "draft") redirect(`/comic/${id}/characters`);
  if (comic.status !== "ready" || comic.stage !== "storyboard" || !comic.script) redirect(`/comic/${id}`);
  const castStages = (comic.cast ?? []).map((member) => ({
    name: member.name,
    stages: (member.stages ?? []).map((stage) => ({ id: stage.id, label: stage.label })),
  }));
  return (
    <StoryboardEditor
      comicId={id}
      styleId={comic.styleId}
      initialScript={comic.script}
      castStages={castStages}
      pricing={picturePricing(IMAGE_MODEL(), imageQuality())}
    />
  );
}
