import { drawingApproved, identityOnly } from "@/lib/comic";
import { addCost } from "@/lib/costs";
import { coverJob, drawImage, panelJob } from "@/lib/engines/art";
import { metered } from "@/lib/meter";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { castFilePath, hasImage, imagePath, isValidImageKey, loadComic, loadImage, saveComic, saveImage, withComicLock } from "@/lib/storage";
import { getStyle } from "@/lib/styles";

export const runtime = "nodejs";
export const maxDuration = 300;

// If the same picture is requested twice at once (e.g. a double click), share one drawing
// instead of paying for two.
const inFlight = new Map<string, Promise<void>>();

/**
 * Draws one picture of a comic (the cover or a panel), unless it already exists.
 * With `{ redraw: true, feedback }` it redraws an existing picture with the requested change.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/comics/[id]/images/[key]">) {
  try {
    const { id, key } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { redraw?: unknown; feedback?: unknown };
    const redraw = body.redraw === true;
    const feedback = typeof body.feedback === "string" ? body.feedback.slice(0, 1000) : "";
    const comic = await loadComic(id);
    const script = comic?.script;
    if (!comic || !script || !isValidImageKey(key)) {
      throw new UserFacingError("We couldn't find that picture.", 404);
    }
    // The one gate in front of every paid picture: the storyboard must be approved first.
    if (!drawingApproved(comic)) {
      throw new UserFacingError("Approve the storyboard before we start drawing.", 409);
    }
    const style = getStyle(comic.styleId);
    if (!style) throw new UserFacingError("This comic's style no longer exists.", 500);
    const castRefs = (comic.cast ?? []).filter((member) => member.design?.approved).map((member) => ({
      name: member.name,
      description: identityOnly(member.description),
      importance: member.importance,
      designPath: castFilePath(id, member.design!.file),
      stages: (member.stages ?? []).map((stage) => ({
        id: stage.id,
        label: stage.label,
        look: identityOnly(stage.look),
        designPath: stage.design?.approved ? castFilePath(id, stage.design.file) : undefined,
      })),
    }));

    const exists = await hasImage(id, key);
    if (redraw && !exists) throw new UserFacingError("This picture hasn't been drawn yet.", 409);
    const revision = redraw ? { currentPath: imagePath(id, key), feedback } : undefined;

    let job;
    if (key === "cover") {
      if (!script.cover) throw new UserFacingError("This comic has no cover.", 404);
      job = coverJob(script, style, castRefs, revision);
    } else {
      const [page, panel] = key.split("-").map((n) => Number(n) - 1);
      if (!script.pages[page]?.panels[panel]) throw new UserFacingError("We couldn't find that panel.", 404);
      job = panelJob(script, page, panel, style, castRefs, revision);
    }

    if (redraw) {
      const flightKey = `${id}/${key}/redraw`;
      let drawing = inFlight.get(flightKey);
      if (!drawing) {
        drawing = metered(() => drawImage(job))
          .then(async ({ result: image, usage }) => {
            await saveImage(id, key, image);
            await withComicLock(id, async () => {
              const latest = await loadComic(id);
              if (!latest) return;
              const updated = { ...latest, redraws: (latest.redraws ?? 0) + 1 };
              addCost(updated, "redraw", key, usage);
              await saveComic(updated);
            });
          })
          .finally(() => inFlight.delete(flightKey));
        inFlight.set(flightKey, drawing);
      }
      await drawing;
    } else if (!exists) {
      const flightKey = `${id}/${key}`;
      let drawing = inFlight.get(flightKey);
      if (!drawing) {
        drawing = metered(() => drawImage(job))
          .then(async ({ result: image, usage }) => {
            await saveImage(id, key, image);
            await withComicLock(id, async () => {
              const latest = await loadComic(id);
              if (!latest) return;
              addCost(latest, "picture", key, usage);
              await saveComic(latest);
            });
          })
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
    // The browser asks again each time (`?v=` changes after a redraw), so a redrawn panel shows up straight away.
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-cache" },
  });
}
