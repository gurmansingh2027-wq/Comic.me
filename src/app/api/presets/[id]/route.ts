import { onExplore, remixPresetFor } from "@/lib/comic";
import { loadComic } from "@/lib/storage";

export const runtime = "nodejs";

/** The shareable format of a published comic, for "Recreate". Contains no private story data. */
export async function GET(_request: Request, ctx: RouteContext<"/api/presets/[id]">) {
  const { id } = await ctx.params;
  const comic = await loadComic(id);
  const preset = comic && onExplore(comic) ? remixPresetFor(comic) : null;
  if (!preset) return Response.json({ error: "That comic isn't available to recreate." }, { status: 404 });
  return Response.json(preset);
}
