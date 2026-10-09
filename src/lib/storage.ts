import "server-only";
import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { IMAGE_KEY_PATTERN, type Comic, type ComicScript } from "./comic";
import { migrateQaRevisions } from "./qa/state";

// v1 keeps comics on the local disk under storage/comics/<id>/.
// Later this module can be swapped for Supabase / Cloudflare R2 without touching the rest of the app.

// COMICME_STORAGE_DIR lets tests use a separate folder, so they never touch real comics.
const ROOT = path.join(process.env.COMICME_STORAGE_DIR || path.join(process.cwd(), "storage"), "comics");
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Shared across route bundles and development reloads in this local Node server.
const shared = globalThis as typeof globalThis & { comicLocks?: Map<string, Promise<unknown>> };
const locks = (shared.comicLocks ??= new Map());

/** Serializes read/modify/write operations for one comic. */
export function withComicLock<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  locks.set(id, next);
  void next.finally(() => {
    if (locks.get(id) === next) locks.delete(id);
  }).catch(() => {});
  return next;
}

export function isValidComicId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function isValidImageKey(key: string): boolean {
  return IMAGE_KEY_PATTERN.test(key);
}

function comicDir(id: string): string {
  if (!isValidComicId(id)) throw new Error(`Invalid comic id: ${id}`);
  return path.join(ROOT, id);
}

export function imagePath(id: string, key: string): string {
  if (!isValidImageKey(key)) throw new Error(`Invalid image key: ${key}`);
  return path.join(comicDir(id), `${key}.webp`);
}

export async function saveComic(comic: Comic): Promise<void> {
  const dir = comicDir(comic.id);
  await mkdir(dir, { recursive: true });
  comic.updatedAt = new Date().toISOString();
  const temporary = path.join(dir, `comic-${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(comic, null, 2));
  await rename(temporary, path.join(dir, "comic.json"));
}

export async function loadComic(id: string): Promise<Comic | null> {
  if (!isValidComicId(id)) return null;
  let data: Comic & { script?: LegacyScript };
  try {
    data = JSON.parse(await readFile(path.join(comicDir(id), "comic.json"), "utf8"));
  } catch {
    return null;
  }
  if (data.script && "panels" in data.script) {
    return upgradeLegacyComic(data as LegacyComic);
  }
  return migrateQaRevisions(data);
}

/** Every saved comic (used by the Explore page; fine for a local prototype, a database query later). */
export async function listComics(): Promise<Comic[]> {
  const ids = await readdir(ROOT).catch(() => [] as string[]);
  const comics = await Promise.all(ids.filter(isValidComicId).map((id) => loadComic(id)));
  return comics.filter((comic): comic is Comic => comic !== null);
}

// --- Character photos and designs (storage/comics/<id>/cast/<file>) -----------------------------

const CAST_FILE_PATTERN = /^[a-z0-9-]{1,80}\.(jpg|webp)$/;

export function isValidCastFile(file: string): boolean {
  return CAST_FILE_PATTERN.test(file);
}

export function castFilePath(id: string, file: string): string {
  if (!isValidCastFile(file)) throw new Error(`Invalid file name: ${file}`);
  return path.join(comicDir(id), "cast", file);
}

export async function saveCastFile(id: string, file: string, data: Buffer): Promise<void> {
  await mkdir(path.join(comicDir(id), "cast"), { recursive: true });
  await writeFile(castFilePath(id, file), data);
}

export async function loadCastFile(id: string, file: string): Promise<Buffer | null> {
  try {
    return await readFile(castFilePath(id, file));
  } catch {
    return null;
  }
}

export async function saveImage(id: string, key: string, image: Buffer): Promise<void> {
  const target = imagePath(id, key);
  const temp = `${target}-${randomUUID()}.tmp`;
  await writeFile(temp, image);
  await rename(temp, target);
}

export async function loadImage(id: string, key: string): Promise<Buffer | null> {
  try {
    return await readFile(imagePath(id, key));
  } catch {
    return null;
  }
}

export async function hasImage(id: string, key: string): Promise<boolean> {
  try {
    await access(imagePath(id, key));
    return true;
  } catch {
    return false;
  }
}

// --- Comics made with the first version (one page of 6 panels) ------------------------------

type LegacyPanel = { scene: string; caption: string; dialogue: { speaker: string; side: "left" | "right"; text: string }[] };
type LegacyScript = { title: string; characters: ComicScript["characters"]; panels: LegacyPanel[] };
type LegacyComic = { id: string; createdAt: string; styleId: string; story: string; script: LegacyScript };

async function upgradeLegacyComic(legacy: LegacyComic): Promise<Comic> {
  const comic: Comic = {
    id: legacy.id,
    createdAt: legacy.createdAt,
    updatedAt: legacy.createdAt,
    styleId: legacy.styleId,
    story: legacy.story,
    status: "ready",
    script: {
      title: legacy.script.title,
      tagline: "",
      bible: null,
      characters: legacy.script.characters,
      cover: null,
      pages: [
        {
          layout: "grid-6",
          panels: legacy.script.panels.map((panel) => ({
            shot: "medium",
            scene: panel.scene,
            caption: panel.caption,
            dialogue: panel.dialogue.map((line) => ({ ...line, kind: "speech" })),
          })),
        },
      ],
    },
  };
  const dir = comicDir(legacy.id);
  for (let n = 1; n <= legacy.script.panels.length; n++) {
    await rename(path.join(dir, `panel-${n}.webp`), path.join(dir, `1-${n}.webp`)).catch(() => {});
  }
  await saveComic(comic);
  return comic;
}

/** Private candidates and rendered QA pages; never served as accepted images. */
export function qaFilePath(id: string, file: string): string {
  if (!/^[a-z0-9-]+\.(webp|jpg)$/.test(file)) throw new Error("Invalid QA file");
  return path.join(comicDir(id), "qa", file);
}
export async function saveQaFile(id: string, file: string, data: Buffer): Promise<void> {
  await mkdir(path.join(comicDir(id), "qa"), { recursive: true });
  const target = qaFilePath(id, file);
  const temp = `${target}-${randomUUID()}.tmp`;
  await writeFile(temp, data);
  await rename(temp, target);
}
export async function loadQaFile(id: string, file: string): Promise<Buffer | null> {
  return readFile(qaFilePath(id, file)).catch(() => null);
}
