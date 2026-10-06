import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { PANEL_COUNT, type Comic } from "./comic";

// v1 keeps comics on the local disk under storage/comics/<id>/.
// Later this module can be swapped for Supabase / Cloudflare R2 without touching the rest of the app.

const ROOT = path.join(process.cwd(), "storage", "comics");
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isValidComicId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function isValidPanelNumber(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= PANEL_COUNT;
}

function comicDir(id: string): string {
  if (!isValidComicId(id)) throw new Error(`Invalid comic id: ${id}`);
  return path.join(ROOT, id);
}

function panelPath(id: string, n: number): string {
  if (!isValidPanelNumber(n)) throw new Error(`Invalid panel number: ${n}`);
  return path.join(comicDir(id), `panel-${n}.webp`);
}

export async function saveComic(comic: Comic): Promise<void> {
  const dir = comicDir(comic.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "comic.json"), JSON.stringify(comic, null, 2));
}

export async function loadComic(id: string): Promise<Comic | null> {
  if (!isValidComicId(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(comicDir(id), "comic.json"), "utf8")) as Comic;
  } catch {
    return null;
  }
}

export async function savePanelImage(id: string, n: number, image: Buffer): Promise<void> {
  await writeFile(panelPath(id, n), image);
}

export async function loadPanelImage(id: string, n: number): Promise<Buffer | null> {
  try {
    return await readFile(panelPath(id, n));
  } catch {
    return null;
  }
}

export async function hasPanelImage(id: string, n: number): Promise<boolean> {
  try {
    await access(panelPath(id, n));
    return true;
  } catch {
    return false;
  }
}
