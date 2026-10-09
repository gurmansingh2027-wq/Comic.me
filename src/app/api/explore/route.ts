import { exploreWall } from "@/lib/explore";

export const runtime = "nodejs";

/** One page of the Explore wall: `?offset=30&limit=30`. Used for infinite scroll. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const limit = Math.min(60, Math.max(1, Number(params.get("limit")) || 30));
  const { tiles } = await exploreWall();
  const page = tiles.slice(offset, offset + limit);
  return Response.json({ tiles: page, nextOffset: offset + limit < tiles.length ? offset + limit : null, total: tiles.length });
}
