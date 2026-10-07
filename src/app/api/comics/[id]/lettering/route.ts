import { errorResponse } from "@/lib/errors";
import { saveLettering } from "@/lib/script-edits";

export const runtime = "nodejs";

/** Saves caption and balloon edits made on the finished comic. */
export async function PUT(request: Request, ctx: RouteContext<"/api/comics/[id]/lettering">) {
  try {
    const { id } = await ctx.params;
    const script = await saveLettering(id, await request.json().catch(() => null));
    return Response.json({ script });
  } catch (error) {
    return errorResponse(error);
  }
}
