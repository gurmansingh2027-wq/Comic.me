import { exportReady } from "@/lib/qa/state";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { hasImage, loadComic, saveComic, withComicLock } from "@/lib/storage";

export const runtime = "nodejs";

/** Publishes a finished comic to Explore (opt-in), or takes it down. */
export async function POST(request: Request, ctx: RouteContext<"/api/comics/[id]/explore">) {
  try {
    const { id } = await ctx.params;
    const { published } = (await request.json().catch(() => ({}))) as { published?: unknown };
    if (typeof published !== "boolean") throw new UserFacingError("Say whether to publish or unpublish.");
    const explore = await withComicLock(id, async () => {
      const comic = await loadComic(id);
      if (!comic?.script) throw new UserFacingError("Comic not found.", 404);
      if (published && !exportReady(comic)) throw new UserFacingError("Finish continuity checks before sharing this comic.", 409);
      if (published && !(await hasImage(id, "cover"))) throw new UserFacingError("Finish drawing the cover before sharing.", 409);
      const next = published ? { published: true, publishedAt: new Date().toISOString() } : { published: false, publishedAt: comic.explore?.publishedAt ?? "" };
      await saveComic({ ...comic, explore: next });
      return next;
    });
    return Response.json({ explore });
  } catch (error) {
    return errorResponse(error);
  }
}
