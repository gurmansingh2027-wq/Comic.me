import { castService, CastCommandSchema } from "@/lib/cast-service";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_CHARACTER } from "@/lib/comic";
import { errorResponse, UserFacingError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 800;

// Bound multipart bodies even when a caller omits Content-Length.
async function photoForm(request: Request): Promise<FormData> {
  const limit = MAX_PHOTO_BYTES * MAX_PHOTOS_PER_CHARACTER + 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new UserFacingError("Upload at most four photos, under 10 MB each.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new UserFacingError("Choose photos to upload.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new UserFacingError("Upload at most four photos, under 10 MB each.", 413);
    }
    chunks.push(value);
  }
  try {
    return await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
  } catch {
    throw new UserFacingError("We couldn't read the upload. Choose your photos and try again.");
  }
}

export async function GET(_request: Request, ctx: RouteContext<"/api/comics/[id]/cast">) {
  try {
    const { id } = await ctx.params;
    return Response.json(await castService.read(id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, ctx: RouteContext<"/api/comics/[id]/cast">) {
  try {
    const { id } = await ctx.params;
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const form = await photoForm(request);
      const memberId = form.get("memberId");
      const photos = form.getAll("photos");
      if (typeof memberId !== "string" || photos.some((file) => !(file instanceof File))) throw new UserFacingError("Choose photos for a character.");
      if (photos.length > MAX_PHOTOS_PER_CHARACTER) throw new UserFacingError("Upload at most four photos per character.");
      if ((photos as File[]).some((file) => file.size > MAX_PHOTO_BYTES)) throw new UserFacingError("Each photo must be under 10 MB.", 413);
      const uploads = await Promise.all((photos as File[]).map(async (file) => ({ type: file.type, data: Buffer.from(await file.arrayBuffer()) })));
      return Response.json(await castService.upload(id, memberId, uploads));
    }
    const body = await request.json().catch(() => null);
    const parsed = CastCommandSchema.safeParse(body);
    if (!parsed.success) {
      const editing = body?.action === "add" || body?.action === "update";
      throw new UserFacingError(
        editing
          ? "Check the character details and try again. Name, role and appearance cannot be empty."
          : "Something about that request wasn't right. Refresh the page and try again.",
      );
    }
    return Response.json(await castService.command(id, parsed.data));
  } catch (error) { return errorResponse(error); }
}
