import { after } from "next/server";
import { errorResponse } from "@/lib/errors";
import { isStale, prepareWriting, runWriting } from "@/lib/pipeline";
import { loadComic } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 800;

/** The comic's progress and, once written, its script. Polled by the comic page. */
export async function GET(_request: Request, ctx: RouteContext<"/api/comics/[id]">) {
  const { id } = await ctx.params;
  const comic = await loadComic(id);
  if (!comic) return Response.json({ error: "Comic not found." }, { status: 404 });

  const status = isStale(comic) ? "failed" : comic.status;
  const error = isStale(comic) ? "Writing was interrupted. Please try again." : comic.error;
  // `since`: when the current stage started, so the page can count down from the right point.
  return Response.json({ status, error, since: comic.updatedAt, script: status === "ready" ? comic.script : undefined });
}

/** Retries writing a comic whose script failed or was interrupted. */
export async function POST(_request: Request, ctx: RouteContext<"/api/comics/[id]">) {
  try {
    const { id } = await ctx.params;
    if (await prepareWriting(id)) after(() => runWriting(id));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
