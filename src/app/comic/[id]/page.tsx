import { notFound, redirect } from "next/navigation";
import ComicViewer from "@/components/ComicViewer";
import Stepper from "@/components/Stepper";
import { imageKeys } from "@/lib/comic";
import { costBreakdown, formatUsd, totalCost } from "@/lib/costs";
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
          <p className="mt-1 text-xs">Estimates from list prices in src/lib/costs.ts. The voice interview (well under $0.50) isn&apos;t included.</p>
        </details>
      )}
    </div>
  );
}
