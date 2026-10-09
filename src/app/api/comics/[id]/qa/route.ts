import { checkFinal, checkPage, qaStatus } from "@/lib/qa/service";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { loadComic } from "@/lib/storage";
export const runtime = "nodejs";
export const maxDuration = 800;
export async function GET(_request: Request, ctx: RouteContext<"/api/comics/[id]/qa">) {
  const comic = await loadComic((await ctx.params).id);
  return comic ? Response.json(qaStatus(comic), { headers: { "Cache-Control": "no-store" } }) : new Response("Not found", { status: 404 });
}
export async function POST(request: Request, ctx: RouteContext<"/api/comics/[id]/qa">) {
  try {
    const { id } = await ctx.params;
    const reader = request.body?.getReader();
    if (!reader) throw new UserFacingError("Missing check request.");
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new UserFacingError("Page is too large.", 413); } chunks.push(value); }
    const body = Buffer.concat(chunks);
    if (request.headers.get("content-type")?.startsWith("image/")) {
      const url = new URL(request.url); const revision = url.searchParams.get("revision"); const page = url.searchParams.get("page");
      if (!revision || !page || !/^(cover|[1-9][0-9]?)$/.test(page)) throw new UserFacingError("Missing page revision.");
      return Response.json(await checkPage(id, revision, page, body));
    }
    const input = JSON.parse(body.toString());
    if (input.action !== "final" || typeof input.revision !== "string") throw new UserFacingError("Invalid check request.");
    return Response.json(await checkFinal(id, input.revision));
  } catch (error) { return errorResponse(error); }
}
