import "server-only";
import { z } from "zod";
import { MAX_PAGES, MAX_PANELS, type ComicScript } from "./comic";
import { UserFacingError } from "./errors";
import { fitLayout, LAYOUT_IDS } from "./layouts";
import { loadComic, saveComic, withComicLock } from "./storage";

// Storyboard editing: the user's edited script is checked here before it's saved, and the
// storyboard is approved here before drawing (and spending money on art) can start.

const Pos = z.object({ x: z.number().min(-0.2).max(1.2), y: z.number().min(-0.2).max(1.2), w: z.number().min(0.05).max(1) });

const Line = z.object({
  speaker: z.string().trim().min(1).max(100),
  side: z.enum(["left", "right"]),
  kind: z.enum(["speech", "shout", "whisper", "thought"]),
  text: z.string().max(400),
  pos: Pos.optional(),
});

const PanelSchema = z.object({
  shot: z.enum(["establishing", "wide", "medium", "close-up", "extreme close-up"]),
  scene: z.string().max(2000),
  caption: z.string().max(400),
  captionPos: Pos.optional(),
  dialogue: z.array(Line).max(4),
});

const PageSchema = z.object({ layout: z.enum(LAYOUT_IDS), panels: z.array(PanelSchema).min(1).max(6) });

const EditableScript = z.object({
  title: z.string().trim().min(1).max(120),
  tagline: z.string().max(200),
  pages: z.array(PageSchema).min(1).max(MAX_PAGES),
});

/** Saves the user's storyboard edits (text, panels, pages, layouts, balloon positions). */
export async function saveStoryboard(id: string, input: unknown): Promise<ComicScript> {
  const parsed = EditableScript.safeParse(input);
  if (!parsed.success) throw new UserFacingError("Some storyboard changes couldn't be saved. Refresh the page and try again.");
  const edits = parsed.data;
  const panels = edits.pages.reduce((sum, page) => sum + page.panels.length, 0);
  if (panels > MAX_PANELS) throw new UserFacingError(`A comic can have at most ${MAX_PANELS} panels. Remove a few to continue.`);

  return withComicLock(id, async () => {
    const comic = await loadComic(id);
    if (!comic?.script) throw new UserFacingError("Comic not found.", 404);
    if (comic.stage !== "storyboard") throw new UserFacingError("Drawing has started, so the storyboard is locked.", 409);
    const script: ComicScript = {
      ...comic.script,
      title: edits.title,
      tagline: edits.tagline,
      pages: edits.pages.map((page) => ({ ...page, layout: fitLayout(page.layout, page.panels.length) })),
    };
    await saveComic({ ...comic, script });
    return script;
  });
}

/** Locks the storyboard and allows drawing to start. */
export async function approveStoryboard(id: string): Promise<void> {
  await withComicLock(id, async () => {
    const comic = await loadComic(id);
    if (!comic?.script) throw new UserFacingError("Comic not found.", 404);
    if (comic.stage !== "storyboard") return;
    comic.script.pages.forEach((page, p) =>
      page.panels.forEach((panel, i) => {
        if (!panel.scene.trim()) {
          throw new UserFacingError(`Describe what we see in panel ${i + 1} on page ${p + 1} before drawing.`);
        }
      }),
    );
    await saveComic({ ...comic, stage: "drawing" });
  });
}

const LetteringEdit = z.object({
  pages: z.array(z.object({ panels: z.array(PanelSchema.pick({ caption: true, captionPos: true, dialogue: true })) })),
});

/**
 * After drawing, only the lettering (captions and balloons: text, type, side and position) can
 * change: it's drawn by our code on top of the art, so editing it is free and never redraws a panel.
 */
export async function saveLettering(id: string, input: unknown): Promise<ComicScript> {
  const parsed = LetteringEdit.safeParse(input);
  if (!parsed.success) throw new UserFacingError("Some text changes couldn't be saved. Refresh the page and try again.");
  return withComicLock(id, async () => {
    const comic = await loadComic(id);
    if (!comic?.script || comic.status !== "ready") throw new UserFacingError("Comic not found.", 404);
    const pages = comic.script.pages;
    const edits = parsed.data.pages;
    if (edits.length !== pages.length || edits.some((page, p) => page.panels.length !== pages[p].panels.length)) {
      throw new UserFacingError("The comic changed. Refresh the page and try again.", 409);
    }
    const script: ComicScript = {
      ...comic.script,
      pages: pages.map((page, p) => ({
        ...page,
        panels: page.panels.map((panel, i) => ({ ...panel, ...edits[p].panels[i] })),
      })),
    };
    await saveComic({ ...comic, script });
    return script;
  });
}
