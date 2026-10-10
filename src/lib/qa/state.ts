import { createHash } from "node:crypto";
import { imageKeys, type Comic } from "../comic";
import { buildLedger } from "../continuity";

export const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** The whole book's drawing plan. Excludes lettering, which can be edited without paying for new art. */
export function artRevision(comic: Comic): string {
  return digest(JSON.stringify({
    style: comic.styleId, cast: comic.cast, objects: comic.objects,
    cover: comic.script?.cover,
    pages: comic.script?.pages.map(page => ({ layout: page.layout, panels: page.panels.map(panel => ({
      scene: panel.scene, shot: panel.shot, context: panel.context, safeShot: panel.safeShot, hero: panel.hero,
    })) })),
  }));
}

/**
 * One picture's drawing plan: the style, cast and canon objects, its own panel (shape included) and its
 * Continuity Ledger entry (who is inside which car, inherited direction, which panel it continues).
 * Editing one panel only makes that picture, and any whose continuity it changes, need a new drawing.
 */
export function pictureRevisions(comic: Comic): Record<string, string> {
  if (!comic.script) return {};
  const shared = { style: comic.styleId, cast: comic.cast, objects: comic.objects };
  const { entries } = buildLedger(comic.script, comic.cast ?? [], comic.objects ?? []);
  const revisions: Record<string, string> = {};
  if (comic.script.cover) revisions.cover = digest(JSON.stringify({ ...shared, cover: comic.script.cover }));
  comic.script.pages.forEach((page, p) => page.panels.forEach((panel, i) => {
    const key = `${p + 1}-${i + 1}`;
    revisions[key] = digest(JSON.stringify({
      ...shared, layout: page.layout, count: page.panels.length, index: i,
      panel: { scene: panel.scene, shot: panel.shot, context: panel.context, safeShot: panel.safeShot, hero: panel.hero },
      ledger: entries.find(entry => entry.key === key),
    }));
  }));
  return revisions;
}
export const pictureRevision = (comic: Comic, key: string): string => pictureRevisions(comic)[key] ?? "";

export function comicRevision(comic: Comic): string {
  return digest(JSON.stringify({ script: comic.script, art: artRevision(comic), pictures: comic.script && imageKeys(comic.script).map(key => [key, comic.qa?.pictures[key]?.accepted?.digest]) }));
}
const pageKeys = (comic: Comic, page: string) => page === "cover" ? ["cover"] : comic.script?.pages[Number(page) - 1]?.panels.map((_, i) => `${page}-${i + 1}`) ?? [];
const pageContent = (comic: Comic, page: string) => page === "cover" ? [comic.script?.title, comic.script?.tagline, comic.script?.cover, comic.script?.coverTitleHidden ?? false] : comic.script?.pages[Number(page) - 1];
export function pageRevision(comic: Comic, page: string, revisions = pictureRevisions(comic)): string {
  const keys = pageKeys(comic, page);
  return digest(JSON.stringify({ art: keys.map(key => revisions[key]), content: pageContent(comic, page), pictures: keys.map(key => comic.qa?.pictures[key]?.accepted?.digest) }));
}
/** The page revision before pictures had their own revisions (whole-book art revision). */
function legacyPageRevision(comic: Comic, page: string): string {
  return digest(JSON.stringify({ art: artRevision(comic), content: pageContent(comic, page), pictures: pageKeys(comic, page).map(key => comic.qa?.pictures[key]?.accepted?.digest) }));
}

/**
 * Comics checked before per-picture revisions stored the whole-book revision on every picture and
 * page check. Records that match the current plan are carried over, so nothing is checked twice.
 */
export function migrateQaRevisions(comic: Comic): Comic {
  if (!comic.qa?.version || comic.qa.revisions === 2 || !comic.script) return comic;
  const legacy = artRevision(comic);
  const revisions = pictureRevisions(comic);
  const pages = Object.fromEntries(Object.keys(comic.qa.pages ?? {}).map(page => [page, legacyPageRevision(comic, page)]));
  for (const [key, record] of Object.entries(comic.qa.pictures)) {
    if (!revisions[key]) continue;
    if (record.revision === legacy) record.revision = revisions[key];
    if (record.accepted?.revision === legacy) record.accepted.revision = revisions[key];
  }
  for (const [page, check] of Object.entries(comic.qa.pages ?? {})) if (check.revision === pages[page]) check.revision = pageRevision(comic, page, revisions);
  comic.qa.revisions = 2;
  return comic;
}

/** Every picture accepted for its current plan and every page checked (problems the redraws couldn't fix stay listed). */
export function picturesAndPagesChecked(comic: Comic): boolean {
  if (!comic.qa?.version) return true;
  const revisions = pictureRevisions(comic);
  return !!comic.script && imageKeys(comic.script).every(key => comic.qa?.pictures[key]?.accepted?.revision === revisions[key])
    && [...(comic.script.cover ? ["cover"] : []), ...comic.script.pages.map((_, p) => String(p + 1))].every(page => comic.qa?.pages?.[page]?.status === "accepted" && comic.qa.pages[page].revision === pageRevision(comic, page, revisions));
}
export function exportReady(comic: Comic): boolean {
  if (!comic.qa?.version) return true;
  const revisions = pictureRevisions(comic);
  return !!comic.script && imageKeys(comic.script).every(key => comic.qa?.pictures[key]?.accepted?.revision === revisions[key])
    && [...(comic.script.cover ? ["cover"] : []), ...comic.script.pages.map((_, p) => String(p + 1))].every(page => comic.qa?.pages?.[page]?.status === "accepted" && comic.qa.pages[page].revision === pageRevision(comic, page, revisions))
    && comic.qa.final?.status === "accepted" && comic.qa.final.revision === comicRevision(comic);
}
/** On Explore: fully checked with nothing open, or featured by the owner after every picture and page was checked. */
export function exploreReady(comic: Comic): boolean {
  return (exportReady(comic) && !comic.qa?.final?.open?.length) || (!!comic.explore?.featured && picturesAndPagesChecked(comic));
}
export function invalidateComposition(comic: Comic): void {
  if (comic.qa) comic.qa.final = undefined;
}
