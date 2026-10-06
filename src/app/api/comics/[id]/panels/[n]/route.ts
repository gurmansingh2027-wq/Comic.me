import { buildPanelPrompt, generatePanelImage } from "@/lib/engines/art";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { hasPanelImage, isValidPanelNumber, loadComic, loadPanelImage, savePanelImage } from "@/lib/storage";
import { getStyle } from "@/lib/styles";

export const runtime = "nodejs";
export const maxDuration = 300;

// If the same panel is requested twice at once (e.g. a double click), share one generation
// instead of paying for two images.
const inFlight = new Map<string, Promise<void>>();

/** Step 2 of making a comic: draw one panel's artwork (skipped if it already exists). */
export async function POST(_request: Request, ctx: RouteContext<"/api/comics/[id]/panels/[n]">) {
  try {
    const { id, n } = await ctx.params;
    const panelNumber = Number(n);
    const comic = await loadComic(id);
    if (!comic || !isValidPanelNumber(panelNumber)) {
      throw new UserFacingError("We couldn't find that comic panel.", 404);
    }

    if (!(await hasPanelImage(id, panelNumber))) {
      const key = `${id}/${panelNumber}`;
      let job = inFlight.get(key);
      if (!job) {
        const style = getStyle(comic.styleId);
        if (!style) throw new UserFacingError("This comic's style no longer exists.", 500);
        const prompt = buildPanelPrompt(comic.script, comic.script.panels[panelNumber - 1], style);
        job = generatePanelImage(prompt)
          .then((image) => savePanelImage(id, panelNumber, image))
          .finally(() => inFlight.delete(key));
        inFlight.set(key, job);
      }
      await job;
    }

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Serves a panel's saved artwork. */
export async function GET(_request: Request, ctx: RouteContext<"/api/comics/[id]/panels/[n]">) {
  const { id, n } = await ctx.params;
  const panelNumber = Number(n);
  const image = isValidPanelNumber(panelNumber) ? await loadPanelImage(id, panelNumber) : null;
  if (!image) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
