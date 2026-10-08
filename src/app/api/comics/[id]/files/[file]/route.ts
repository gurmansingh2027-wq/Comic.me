import { isValidCastFile, loadCastFile, loadComic } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: RouteContext<"/api/comics/[id]/files/[file]">) {
  const { id, file } = await ctx.params;
  if (!isValidCastFile(file)) return new Response("Not found", { status: 404 });
  const comic = await loadComic(id);
  const referenced = comic?.cast?.some(
    (member) =>
      member.photos.includes(file) || member.design?.file === file || member.stages?.some((stage) => stage.design?.file === file),
  );
  const data = referenced ? await loadCastFile(id, file) : null;
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), { headers: {
    "Content-Type": file.endsWith(".jpg") ? "image/jpeg" : "image/webp",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  } });
}
