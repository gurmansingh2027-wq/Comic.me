import { errorResponse } from "@/lib/errors";
import { approveStoryboard, saveStoryboard } from "@/lib/script-edits";

export const runtime = "nodejs";

/** Saves storyboard edits. */
export async function PUT(request: Request, ctx: RouteContext<"/api/comics/[id]/storyboard">) {
  try {
    const { id } = await ctx.params;
    const script = await saveStoryboard(id, await request.json().catch(() => null));
    return Response.json({ script });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Approves the storyboard so drawing can start. */
export async function POST(_request: Request, ctx: RouteContext<"/api/comics/[id]/storyboard">) {
  try {
    const { id } = await ctx.params;
    await approveStoryboard(id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
