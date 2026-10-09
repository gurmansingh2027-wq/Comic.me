import { notFound, redirect } from "next/navigation";
import StoryboardEditor from "@/components/StoryboardEditor";
import StoryboardWriting from "@/components/StoryboardWriting";
import { comicStep } from "@/lib/comic";
import { picturePricing } from "@/lib/costs";
import { heroQuality, IMAGE_MODEL, imageQuality } from "@/lib/engines/art";
import { isStale } from "@/lib/pipeline";
import { loadComic } from "@/lib/storage";

export const metadata = { title: "Your storyboard — Comic.me" };
export const dynamic = "force-dynamic";

/**
 * Step 4. Shows the script being written, then the editable storyboard. Drawing (step 5)
 * only starts after the user approves it here.
 */
export default async function StoryboardPage(props: PageProps<"/comic/[id]/storyboard">) {
  const { id } = await props.params;
  const comic = await loadComic(id);
  if (!comic) notFound();
  const step = comicStep(comic);
  if (step === "characters") redirect(`/comic/${id}/characters`);
  if (step === "comic") redirect(`/comic/${id}`);

  if (comic.status !== "ready" || !comic.script) {
    const stale = isStale(comic);
    return (
      <StoryboardWriting
        comicId={id}
        initialStatus={stale ? "failed" : comic.status}
        initialError={stale ? "Writing was interrupted. Please try again." : comic.error}
        initialSince={comic.updatedAt}
      />
    );
  }

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
      pricing={picturePricing(IMAGE_MODEL(), imageQuality(), heroQuality())}
    />
  );
}
