import "server-only";
import { remixPresetFor, type Comic, type CoverFont } from "./comic";
import { LAYOUTS } from "./layouts";
import { hasImage, listComics } from "./storage";
import { getStyle } from "./styles";

// Builds the Explore wall from comics their owners chose to publish. Only rendered art is shown:
// never uploaded photos, character design sheets or the story text.

export type ExploreTile = {
  key: string;
  comicId: string;
  kind: "cover" | "panel";
  src: string;
  /** width / height of the tile */
  aspect: number;
  title: string;
  styleLabel: string;
  titleFont?: CoverFont;
  titleFill?: string;
  titleOutline?: string;
  titlePosition?: "top" | "bottom";
};

export type ExploreComic = {
  id: string;
  title: string;
  tagline: string;
  styleLabel: string;
  pageCount: number;
  panelCount: number;
  coverApproach?: string;
  tiles: ExploreTile[];
};

/** The biggest panels in a comic: its splash pages and big moments make the best wall tiles. */
async function highlightPanels(comic: Comic, limit: number): Promise<ExploreTile[]> {
  const script = comic.script!;
  const candidates = script.pages.flatMap((page, p) =>
    LAYOUTS[page.layout].panels.map((rect, i) => ({ p, i, area: rect.w * rect.h, aspect: rect.w / rect.h })),
  );
  candidates.sort((a, b) => b.area - a.area);
  const tiles: ExploreTile[] = [];
  for (const candidate of candidates) {
    if (tiles.length >= limit) break;
    const key = `${candidate.p + 1}-${candidate.i + 1}`;
    if (!(await hasImage(comic.id, key))) continue;
    tiles.push({
      key: `${comic.id}/${key}`,
      comicId: comic.id,
      kind: "panel",
      src: `/api/comics/${comic.id}/images/${key}`,
      aspect: Math.min(Math.max(candidate.aspect, 0.45), 2.2),
      title: script.title,
      styleLabel: getStyle(comic.styleId)?.label ?? comic.styleId,
    });
  }
  return tiles;
}

export async function explorableComic(comic: Comic, panels = 2): Promise<ExploreComic | null> {
  if (!comic.explore?.published || !comic.script || !(await hasImage(comic.id, "cover"))) return null;
  const script = comic.script;
  const design = script.cover?.design;
  const styleLabel = getStyle(comic.styleId)?.label ?? comic.styleId;
  const preset = remixPresetFor(comic)!;
  return {
    id: comic.id,
    title: script.title,
    tagline: script.tagline,
    styleLabel,
    pageCount: preset.pageCount,
    panelCount: preset.panelCount,
    coverApproach: preset.coverApproach,
    tiles: [
      {
        key: `${comic.id}/cover`,
        comicId: comic.id,
        kind: "cover",
        src: `/api/comics/${comic.id}/images/cover`,
        aspect: 2 / 3,
        title: script.title,
        styleLabel,
        titleFont: design?.titleFont ?? "bangers",
        titleFill: design?.titleFill ?? "#facc15",
        titleOutline: design?.titleOutline ?? "#111111",
        titlePosition: design?.titlePosition ?? "top",
      },
      ...(await highlightPanels(comic, panels)),
    ],
  };
}

export async function exploreWall(): Promise<{ comics: ExploreComic[]; tiles: ExploreTile[] }> {
  const all = await listComics();
  const published = all
    .filter((comic) => comic.explore?.published)
    .sort((a, b) => (b.explore!.publishedAt > a.explore!.publishedAt ? 1 : -1));
  const comics = (await Promise.all(published.map((comic) => explorableComic(comic)))).filter((c): c is ExploreComic => c !== null);
  // Interleave: every comic's cover first, then their highlight panels, so the wall mixes comics.
  const tiles: ExploreTile[] = [];
  const longest = Math.max(0, ...comics.map((c) => c.tiles.length));
  for (let round = 0; round < longest; round++) for (const comic of comics) if (comic.tiles[round]) tiles.push(comic.tiles[round]);
  return { comics, tiles };
}
