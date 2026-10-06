import { coverJob, drawImage, panelJob } from "@/lib/engines/art";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { hasImage, isValidImageKey, loadComic, loadImage, saveImage } from "@/lib/storage";
import { getStyle } from "@/lib/styles";

export const runtime = "nodejs";
export const maxDuration = 300;

// If the same picture is requested twice at once (e.g. a double click), share one drawing
// instead of paying for two.
const inFlight = new Map<string, Promise<void>>();

/** Draws one picture of a comic (the cover or a panel), unless it already exists. */
export async function POST(_request: Request, ctx: RouteContext<"/api/comics/[id]/images/[key]">) {
  try {
    const { id, key } = await ctx.params;
    const comic = await loadComic(id);
    const script = comic?.script;
    if (!comic || !script || comic.status !== "ready" || !isValidImageKey(key)) {
      throw new UserFacingError("We couldn't find that picture.", 404);
    }
    const style = getStyle(comic.styleId);
    if (!style) throw new UserFacingError("This comic's style no longer exists.", 500);

    let job;
    if (key === "cover") {
      if (!script.cover) throw new UserFacingError("This comic has no cover.", 404);
      job = coverJob(script, style);
    } else {
      const [page, panel] = key.split("-").map((n) => Number(n) - 1);
      if (!script.pages[page]?.panels[panel]) throw new UserFacingError("We couldn't find that panel.", 404);
      job = panelJob(script, page, panel, style);
    }

    if (!(await hasImage(id, key))) {
      const flightKey = `${id}/${key}`;
      let drawing = inFlight.get(flightKey);
      if (!drawing) {
        drawing = drawImage(job)
          .then((image) => saveImage(id, key, image))
          .finally(() => inFlight.delete(flightKey));
        inFlight.set(flightKey, drawing);
      }
      await drawing;
    }

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Serves a saved picture. */
export async function GET(_request: Request, ctx: RouteContext<"/api/comics/[id]/images/[key]">) {
  const { id, key } = await ctx.params;
  const image = isValidImageKey(key) ? await loadImage(id, key) : null;
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600" },
  });
}
