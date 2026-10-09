import "server-only";
import { castReady, missingApprovals, type Comic } from "./comic";
import { addCost } from "./costs";
import { designCover } from "./engines/cover";
import { polishScript, writeScript } from "./engines/story";
import { friendlyError, UserFacingError } from "./errors";
import { metered } from "./meter";
import type { CostUsage } from "./comic";
import { loadComic, saveComic, withComicLock } from "./storage";
import { getStyle } from "./styles";

// Runs the writing steps for a comic in the background and records progress in comic.json,
// so the Storyboard page can show "Writing…", "Polishing…" and then the storyboard to review.
// Writing never starts drawing: that only happens after the user approves the storyboard.

const shared = globalThis as typeof globalThis & { comicWriting?: Set<string> };
const running = (shared.comicWriting ??= new Set());
const STALE_AFTER_MS = 15 * 60 * 1000;

/** A comic stuck in "writing" (e.g. the app was restarted mid-way) can be retried. */
export function isStale(comic: Comic): boolean {
  const busy = comic.status === "writing" || comic.status === "polishing";
  return busy && !running.has(comic.id) && Date.now() - Date.parse(comic.updatedAt) > STALE_AFTER_MS;
}

export function isRunning(id: string): boolean {
  return running.has(id);
}

/** Marks the comic busy before scheduling background work, closing the edit/start race. */
export function prepareWriting(id: string): Promise<boolean> {
  return withComicLock(id, async () => {
    const comic = await loadComic(id);
    if (!comic) throw new UserFacingError("Comic not found.", 404);
    if (comic.status === "ready") throw new UserFacingError("This comic is already written.", 409);
    if (isRunning(id) || ((comic.status === "writing" || comic.status === "polishing") && !isStale(comic))) return false;
    if ((comic.status === "draft" && comic.cast === undefined) || (comic.cast !== undefined && !castReady(comic.cast, comic.objects))) {
      throw new UserFacingError(`Approve these designs first: ${missingApprovals(comic.cast, comic.objects).join(", ")}.`, 409);
    }
    // From here on the comic belongs to the Storyboard step: nothing is drawn until it's approved.
    await saveComic({ ...comic, status: "writing", stage: "storyboard", error: undefined });
    return true;
  });
}

export async function runWriting(id: string): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  let comic: Comic | null = null;
  try {
    comic = await loadComic(id);
    if (!comic) return;
    if (comic.status === "draft" || (comic.cast !== undefined && !castReady(comic.cast, comic.objects))) throw new UserFacingError("Approve your characters first.", 409);
    const style = getStyle(comic.styleId);
    if (!style) throw new Error(`Unknown style ${comic.styleId}`);

    comic = { ...comic, status: "writing", stage: "storyboard", error: undefined };
    await saveComic(comic);
    const direct = await metered(() => writeScript(comic!.story, style, comic!.cast, comic!.preset, comic!.objects));
    const draft = direct.result;

    comic = { ...comic, status: "polishing", script: draft };
    await saveComic(comic);
    const story = comic.story;
    const cast = comic.cast;
    const preset = comic.preset;
    const edit = await metered(() =>
      polishScript(story, draft, style).catch((error) => {
        // The draft is already good enough to draw; don't fail the whole comic over the polish pass.
        console.error("Polish pass failed, keeping the draft:", error);
        return draft;
      }),
    );
    const polished = edit.result;
    // The cover gets its own art director pass, built around this story's theme.
    const coverPass = await metered(() =>
      designCover(polished, story, style, cast, preset).catch((error) => {
        console.error("Cover design failed, keeping the writer's cover:", error);
        return polished.cover;
      }),
    );
    const cover = coverPass.result;
    const script = { ...polished, cover };

    // The user reviews and edits the storyboard before any (paid) drawing starts.
    const finished = { ...comic, status: "ready" as const, stage: "storyboard" as const, script };
    const passes: [string, CostUsage[]][] = [
      ["comic director", direct.usage],
      ["dialogue editor", edit.usage],
      ["cover art director", coverPass.usage],
    ];
    for (const [detail, usage] of passes) if (usage.length) addCost(finished, "script", detail, usage);
    await saveComic(finished);
  } catch (error) {
    if (comic) await saveComic({ ...comic, status: "failed", error: friendlyError(error).message });
  } finally {
    running.delete(id);
  }
}
