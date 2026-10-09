import { drawingService } from "@/lib/drawing-service";
import { errorResponse } from "@/lib/errors";
import { isValidImageKey, loadImage } from "@/lib/storage";
export const runtime = "nodejs";
export const maxDuration = 800;
export async function POST(request: Request, ctx: RouteContext<"/api/comics/[id]/images/[key]">) {
  try {
    const { id, key } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    await drawingService.draw(id, key, {
      redraw: body.redraw === true,
      restart: body.restart === true,
      fresh: body.fresh === true,
      requestId: typeof body.requestId === "string" ? body.requestId.slice(0, 80) : undefined,
      expectedDigest: typeof body.expectedDigest === "string" ? body.expectedDigest : undefined,
      feedback: typeof body.feedback === "string" ? body.feedback.slice(0, 1000) : undefined,
    });
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
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
