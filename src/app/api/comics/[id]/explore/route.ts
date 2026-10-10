import { exportReady, picturesAndPagesChecked } from "@/lib/qa/state";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { hasImage, loadComic, saveComic, withComicLock } from "@/lib/storage";

export const runtime = "nodejs";

/** Publishes a finished comic to Explore (opt-in), or takes it down. */
export async function POST(request: Request, ctx: RouteContext<"/api/comics/[id]/explore">) {
  try {
    const { id } = await ctx.params;
    const { published, featured } = (await request.json().catch(() => ({}))) as { published?: unknown; featured?: unknown };
    if (typeof published !== "boolean") throw new UserFacingError("Say whether to publish or unpublish.");
    const explore = await withComicLock(id, async () => {
      const comic = await loadComic(id);
      if (!comic?.script) throw new UserFacingError("Comic not found.", 404);
      // Featuring skips the whole-book read-through; every picture and page must have been checked.
      const feature = published && featured === true && !exportReady(comic);
      if (feature && !picturesAndPagesChecked(comic)) throw new UserFacingError("Every picture and page needs to be checked before this comic can go on Explore.", 409);
      if (published && !feature && !exportReady(comic)) throw new UserFacingError("Finish continuity checks before sharing this comic.", 409);
      if (published && !feature && comic.qa?.final?.open?.length) throw new UserFacingError("Redraw the panels the checks flagged before sharing this comic.", 409);
      if (published && !(await hasImage(id, "cover"))) throw new UserFacingError("Finish drawing the cover before sharing.", 409);
      const next = published ? { published: true, publishedAt: new Date().toISOString(), ...(feature ? { featured: true } : {}) } : { published: false, publishedAt: comic.explore?.publishedAt ?? "" };
      await saveComic({ ...comic, explore: next });
      return next;
    });
    return Response.json({ explore });
  } catch (error) {
    return errorResponse(error);
  }
}
