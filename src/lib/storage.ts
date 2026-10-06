import "server-only";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { IMAGE_KEY_PATTERN, type Comic, type ComicScript } from "./comic";

// v1 keeps comics on the local disk under storage/comics/<id>/.
// Later this module can be swapped for Supabase / Cloudflare R2 without touching the rest of the app.

const ROOT = path.join(process.cwd(), "storage", "comics");
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

function imagePath(id: string, key: string): string {
  if (!isValidImageKey(key)) throw new Error(`Invalid image key: ${key}`);
  return path.join(comicDir(id), `${key}.webp`);
}

export async function saveComic(comic: Comic): Promise<void> {
  const dir = comicDir(comic.id);
  await mkdir(dir, { recursive: true });
  comic.updatedAt = new Date().toISOString();
  await writeFile(path.join(dir, "comic.json"), JSON.stringify(comic, null, 2));
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
  return data;
}

export async function saveImage(id: string, key: string, image: Buffer): Promise<void> {
  await writeFile(imagePath(id, key), image);
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
