import { notFound, redirect } from "next/navigation";
import ComicViewer from "@/components/ComicViewer";
import Stepper from "@/components/Stepper";
import { comicStep, imageKeys, onExplore } from "@/lib/comic";
import { costBreakdown, formatUsd, totalCost } from "@/lib/costs";
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
  // Step 5 only exists once the storyboard is approved; writing and review happen on step 4.
  const step = comicStep(comic);
  if (step === "characters") redirect(`/comic/${id}/characters`);
  if (step === "storyboard" || !comic.script) redirect(`/comic/${id}/storyboard`);

  const keys = imageKeys(comic.script);
  const drawn = await Promise.all(keys.map((key) => hasImage(id, key)));

  return (
    <div className="space-y-8">
      <Stepper current="Your comic" />
      <ComicViewer
        comicId={comic.id}
        styleId={comic.styleId}
        script={comic.script}
        alreadyDrawn={keys.filter((_, i) => drawn[i])}
        initialPublished={onExplore(comic)}
      />
      {comic.costLog && comic.costLog.length > 0 && (
        <details className="mx-auto max-w-xl text-sm text-neutral-600">
          <summary className="cursor-pointer text-center">
            Behind the scenes: AI cost for this comic so far ≈ {formatUsd(totalCost(comic.costLog))} (refresh to update)
          </summary>
          <ul className="mt-2 space-y-1 rounded border-2 border-neutral-300 bg-white p-3">
            {costBreakdown(comic.costLog).map((row) => (
              <li key={row.item} className="flex justify-between">
                <span>
                  {row.item.replace("-", " ")} × {row.count}
                </span>
                <span>{formatUsd(row.usd)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">
            Priced from the usage each provider reported, at the list prices in src/lib/costs.ts
            {comic.costLog.some((entry) => entry.usage?.some((usage) => usage.measured === false)) && " (a few items, like read-aloud, are estimates)"}.
          </p>
        </details>
      )}
    </div>
  );
}
