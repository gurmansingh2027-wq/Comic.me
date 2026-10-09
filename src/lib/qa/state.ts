import { createHash } from "node:crypto";
import { imageKeys, type Comic } from "../comic";

export const digest = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** Excludes lettering, which can be edited without paying for new art. */
export function artRevision(comic: Comic): string {
  return digest(JSON.stringify({
    style: comic.styleId, cast: comic.cast, objects: comic.objects,
    cover: comic.script?.cover,
    pages: comic.script?.pages.map(page => ({ layout: page.layout, panels: page.panels.map(panel => ({
      scene: panel.scene, shot: panel.shot, context: panel.context, safeShot: panel.safeShot, hero: panel.hero,
    })) })),
  }));
}
export function comicRevision(comic: Comic): string {
  return digest(JSON.stringify({ script: comic.script, art: artRevision(comic), pictures: comic.script && imageKeys(comic.script).map(key => [key, comic.qa?.pictures[key]?.accepted?.digest]) }));
}
export function pageRevision(comic: Comic, page: string): string {
  const keys = page === "cover" ? ["cover"] : comic.script?.pages[Number(page) - 1]?.panels.map((_, i) => `${page}-${i + 1}`) ?? [];
  return digest(JSON.stringify({ art: artRevision(comic), content: page === "cover" ? [comic.script?.title, comic.script?.tagline, comic.script?.cover] : comic.script?.pages[Number(page) - 1], pictures: keys.map(key => comic.qa?.pictures[key]?.accepted?.digest) }));
}
export function exportReady(comic: Comic): boolean {
  if (!comic.qa?.version) return true;
  const revision = artRevision(comic);
  return !!comic.script && imageKeys(comic.script).every(key => comic.qa?.pictures[key]?.accepted?.revision === revision)
    && [...(comic.script.cover ? ["cover"] : []), ...comic.script.pages.map((_, p) => String(p + 1))].every(page => comic.qa?.pages?.[page]?.status === "accepted" && comic.qa.pages[page].revision === pageRevision(comic, page))
    && comic.qa.final?.status === "accepted" && comic.qa.final.revision === comicRevision(comic);
}
export function invalidateComposition(comic: Comic): void {
  if (comic.qa) comic.qa.final = undefined;
}
