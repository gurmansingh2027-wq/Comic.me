import "server-only";
import { exportReady } from "./qa/state";
import { drawingApproved, onExplore, panelKey, remixPresetFor, type Comic, type CoverDesign, type Page } from "./comic";
import { LAYOUTS } from "./layouts";
import { hasImage, listComics } from "./storage";
import { getStyle } from "./styles";

// Builds the Explore wall from the comics already made (for the prototype every comic is on
// Explore unless its owner hid it). One comic contributes several tiles: its cover, a lettered
// page, its hero panels and its biggest panels. Only finished art is shown: never uploaded
// photos, character design sheets or the story text.

type TileBase = {
  key: string;
  comicId: string;
  /** width / height */
  aspect: number;
  title: string;
  styleId: string;
  styleLabel: string;
  /** A tiny descriptor shown on hover (the tagline). */
  descriptor: string;
  /** Hero panels and wide panels are shown bigger when there's room. */
  feature: boolean;
};

export type ExploreTile =
  | (TileBase & { kind: "panel"; src: string })
  | (TileBase & { kind: "cover"; src: string; tagline: string; design?: CoverDesign })
  | (TileBase & { kind: "page"; page: Page; pageIndex: number; srcs: string[] });

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

const imageSrc = (comicId: string, key: string) => `/api/comics/${comicId}/images/${key}`;
const clampAspect = (aspect: number) => Math.min(Math.max(aspect, 0.42), 2.6);

export async function explorableComic(comic: Comic, panelLimit = 4): Promise<ExploreComic | null> {
  if (!onExplore(comic) || !exportReady(comic) || !comic.script || !drawingApproved(comic)) return null;
  const script = comic.script;
  const styleLabel = getStyle(comic.styleId)?.label ?? comic.styleId;
  const base = { comicId: comic.id, title: script.title, styleId: comic.styleId, styleLabel, descriptor: script.tagline };
  const drawn = new Set(
    (
      await Promise.all(
        ["cover", ...script.pages.flatMap((page, p) => page.panels.map((_, i) => panelKey(p, i)))].map(async (key) => ((await hasImage(comic.id, key)) ? key : null)),
      )
    ).filter((key): key is string => key !== null),
  );
  if (drawn.size === 0) return null;

  const tiles: ExploreTile[] = [];
  if (drawn.has("cover") && script.cover) {
    tiles.push({ ...base, key: `${comic.id}/cover`, kind: "cover", src: imageSrc(comic.id, "cover"), aspect: 2 / 3, feature: false, tagline: script.tagline, design: script.cover.design });
  }

  // One lettered page: the one with a hero panel, else the most cinematic layout that's fully drawn.
  const complete = script.pages.map((page, p) => page.panels.every((_, i) => drawn.has(panelKey(p, i))));
  const rank = (p: number) => (script.pages[p].panels.some((panel) => panel.hero) ? 3 : ["splash", "big-top", "big-bottom", "tall-left"].includes(script.pages[p].layout) ? 2 : 1);
  const pageIndex = script.pages.map((_, p) => p).filter((p) => complete[p] && script.pages.length > 1).sort((a, b) => rank(b) - rank(a))[0];
  if (pageIndex !== undefined) {
    const page = script.pages[pageIndex];
    tiles.push({
      ...base,
      key: `${comic.id}/page-${pageIndex + 1}`,
      kind: "page",
      page,
      pageIndex,
      srcs: page.panels.map((_, i) => imageSrc(comic.id, panelKey(pageIndex, i))),
      aspect: 2 / 3,
      feature: false,
    });
  }

  // Panels: hero panels first, then the biggest (big panels hold the big moments), mixing shapes.
  const candidates = script.pages
    .flatMap((page, p) =>
      LAYOUTS[page.layout].panels.map((rect, i) => ({ p, i, area: rect.w * rect.h, aspect: rect.w / rect.h, hero: !!page.panels[i]?.hero })),
    )
    .filter((c) => c.p !== pageIndex && drawn.has(panelKey(c.p, c.i)))
    .sort((a, b) => Number(b.hero) - Number(a.hero) || b.area - a.area);
  const picked: typeof candidates = [];
  for (const candidate of candidates) {
    if (picked.length >= panelLimit) break;
    const shape = candidate.aspect >= 1.4 ? "wide" : candidate.aspect <= 0.75 ? "tall" : "square";
    const sameShape = picked.filter((c) => (c.aspect >= 1.4 ? "wide" : c.aspect <= 0.75 ? "tall" : "square") === shape).length;
    if (!candidate.hero && sameShape >= 2 && candidates.length > panelLimit * 2) continue;
    picked.push(candidate);
  }
  for (const c of picked) {
    const key = panelKey(c.p, c.i);
    tiles.push({ ...base, key: `${comic.id}/${key}`, kind: "panel", src: imageSrc(comic.id, key), aspect: clampAspect(c.aspect), feature: c.hero || c.aspect >= 1.7 });
  }

  const preset = remixPresetFor(comic)!;
  return {
    id: comic.id,
    title: script.title,
    tagline: script.tagline,
    styleLabel,
    pageCount: preset.pageCount,
    panelCount: preset.panelCount,
    coverApproach: preset.coverApproach,
    tiles,
  };
}

/** A stable shuffle, so the wall feels hand-arranged but doesn't jump around on every visit. */
function seeded(key: string): number {
  let hash = 0;
  for (const char of key) hash = (hash * 33 + char.charCodeAt(0)) | 0;
  return hash;
}

export async function exploreWall(): Promise<{ comics: ExploreComic[]; tiles: ExploreTile[] }> {
  const all = await listComics();
  const comics = (await Promise.all(all.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1)).map((comic) => explorableComic(comic))))
    .filter((c): c is ExploreComic => c !== null);
  // Round-robin across comics so neighbours come from different stories, with a little stable shuffle per round.
  // Each comic starts from a different kind of tile (cover, page, panel…), so even the first row mixes shapes.
  const rotated = comics.map((comic, c) => {
    const shift = comic.tiles.length ? c % comic.tiles.length : 0;
    return [...comic.tiles.slice(shift), ...comic.tiles.slice(0, shift)];
  });
  const tiles: ExploreTile[] = [];
  const longest = Math.max(0, ...rotated.map((list) => list.length));
  for (let round = 0; round < longest; round++) {
    const row = rotated.map((list) => list[round]).filter((tile): tile is ExploreTile => !!tile);
    row.sort((a, b) => seeded(a.key) - seeded(b.key));
    tiles.push(...row);
  }
  return { comics, tiles };
}
