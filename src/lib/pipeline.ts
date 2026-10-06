import "server-only";
import type { Comic } from "./comic";
import { polishScript, writeScript } from "./engines/story";
import { friendlyError } from "./errors";
import { loadComic, saveComic } from "./storage";
import { getStyle } from "./styles";

// Runs the writing steps for a comic in the background and records progress in comic.json,
// so the comic page can show "Writing…", "Polishing…" and then start drawing.

const running = new Set<string>();
const STALE_AFTER_MS = 15 * 60 * 1000;

/** A comic stuck in "writing" (e.g. the app was restarted mid-way) can be retried. */
export function isStale(comic: Comic): boolean {
  const busy = comic.status === "writing" || comic.status === "polishing";
  return busy && !running.has(comic.id) && Date.now() - Date.parse(comic.updatedAt) > STALE_AFTER_MS;
}

export function isRunning(id: string): boolean {
  return running.has(id);
}

export async function runWriting(id: string): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  let comic = await loadComic(id);
  try {
    if (!comic) return;
    const style = getStyle(comic.styleId);
    if (!style) throw new Error(`Unknown style ${comic.styleId}`);

    comic = { ...comic, status: "writing", error: undefined };
    await saveComic(comic);
    const draft = await writeScript(comic.story, style);

    comic = { ...comic, status: "polishing", script: draft };
    await saveComic(comic);
    const script = await polishScript(comic.story, draft).catch((error) => {
      // The draft is already good enough to draw; don't fail the whole comic over the polish pass.
      console.error("Polish pass failed, keeping the draft:", error);
      return draft;
    });

    await saveComic({ ...comic, status: "ready", script });
  } catch (error) {
    if (comic) await saveComic({ ...comic, status: "failed", error: friendlyError(error).message });
  } finally {
    running.delete(id);
  }
}
