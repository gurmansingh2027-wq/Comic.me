import "server-only";
import { z } from "zod";
import { BALLOON_KINDS, COMPLEXITIES, MAX_PAGES, MAX_PANELS, maxHeroPanels, type ComicScript } from "./comic";
import { buildLedger } from "./continuity";
import { missingApprovals } from "./comic";
import { invalidateComposition } from "./qa/state";
import { UserFacingError } from "./errors";
import { fitLayout, LAYOUT_IDS } from "./layouts";
import { loadComic, saveComic, withComicLock } from "./storage";

// Storyboard editing: the user's edited script is checked here before it's saved, and the
// storyboard is approved here before drawing (and spending money on art) can start.

const Pos = z.object({ x: z.number().min(-0.2).max(1.2), y: z.number().min(-0.2).max(1.2), w: z.number().min(0.05).max(1) });

const Line = z.object({
  speaker: z.string().trim().min(1).max(100),
  side: z.enum(["left", "right"]),
  kind: z.enum(BALLOON_KINDS),
  text: z.string().max(400),
  pos: Pos.optional(),
});

const short = z.string().max(300);
const ContextSchema = z.object({
  location: short,
  period: short,
  timeOfDay: short,
  weather: short,
  event: short,
  activity: short.optional(),
  camera: short.optional(),
  relationships: short.optional(),
  cast: z
    .array(
      z.object({
        name: z.string().max(100),
        stage: z.string().max(40),
        wardrobe: short,
        emotion: short,
        action: short,
        inside: z.object({ objectId: z.string().max(40), position: short }).optional(),
        lookChange: short.optional(),
        lookChangeApproved: z.boolean().optional(),
        lookChangeReviewed: z.boolean().optional(),
      }),
    )
    .max(8),
  objects: z.array(short).max(10),
  canon: z.array(z.object({ id: z.string().max(40), state: short.optional(), position: short.optional() })).max(6).optional(),
  sequence: z.string().max(60).optional(),
  motion: z
    .object({ direction: z.enum(["left-to-right", "right-to-left", "toward-camera", "away-from-camera", "static"]), order: short.optional(), cameraSide: short.optional() })
    .optional(),
  axisChange: z.boolean().optional(),
  transition: z.string().max(300).optional(),
  continuity: z.string().max(600),
});

const PanelSchema = z.object({
  shot: z.enum(["establishing", "wide", "medium", "close-up", "extreme close-up"]),
  scene: z.string().max(2000),
  caption: z.string().max(400),
  captionPos: Pos.optional(),
  dialogue: z.array(Line).max(4),
  sfx: z.string().max(40).optional(),
  sfxPos: Pos.optional(),
  context: ContextSchema.optional(),
  hero: z.boolean().optional(),
  heroReason: z.string().max(300).optional(),
  complexity: z.enum(COMPLEXITIES).optional(),
  safeShot: z.string().max(1000).optional(),
});

const PageSchema = z.object({ layout: z.enum(LAYOUT_IDS), panels: z.array(PanelSchema).min(1).max(6) });

const EditableScript = z.object({
  title: z.string().trim().min(1).max(120),
  tagline: z.string().max(200),
  coverScene: z.string().max(3000).optional(),
  /** Which of the art director's cover ideas the user picked (index into cover.options). */
  coverChoice: z.number().int().min(0).max(5).optional(),
  pages: z.array(PageSchema).min(1).max(MAX_PAGES),
});

/** Applies a picked cover idea (its scene and title design), then any edits to the scene text. */
function editedCover(cover: ComicScript["cover"], choice: number | undefined, scene: string | undefined): ComicScript["cover"] {
  if (!cover) return cover;
  const picked = choice !== undefined && cover.options?.[choice] ? { ...cover, ...cover.options[choice] } : cover;
  return scene !== undefined ? { ...picked, scene } : picked;
}

/** Saves the user's storyboard edits (text, panels, pages, layouts, balloon positions). */
export async function saveStoryboard(id: string, input: unknown): Promise<ComicScript> {
  const parsed = EditableScript.safeParse(input);
  if (!parsed.success) throw new UserFacingError("Some storyboard changes couldn't be saved. Refresh the page and try again.");
  const edits = parsed.data;
  const panels = edits.pages.reduce((sum, page) => sum + page.panels.length, 0);
  if (panels > MAX_PANELS) throw new UserFacingError(`A comic can have at most ${MAX_PANELS} panels. Remove a few to continue.`);
  const heroes = edits.pages.reduce((sum, page) => sum + page.panels.filter((panel) => panel.hero).length, 0);
  if (heroes > maxHeroPanels(edits.pages.length)) {
    throw new UserFacingError(`Pick at most ${maxHeroPanels(edits.pages.length)} hero panels: they're the moments we pull out all the stops for.`);
  }

  return withComicLock(id, async () => {
    const comic = await loadComic(id);
    if (!comic?.script) throw new UserFacingError("Comic not found.", 404);
    if (comic.stage !== "storyboard") throw new UserFacingError("Drawing has started, so the storyboard is locked.", 409);
    const script: ComicScript = {
      ...comic.script,
      title: edits.title,
      tagline: edits.tagline,
      cover: editedCover(comic.script.cover, edits.coverChoice, edits.coverScene),
      pages: edits.pages.map((page) => ({ ...page, layout: fitLayout(page.layout, page.panels.length) })),
    };
    script.pages.forEach((page, p) => page.panels.forEach((panel, i) => panel.context?.cast.forEach(person => {
      const previous = comic.script?.pages[p]?.panels[i]?.context?.cast.find(old => old.name === person.name);
      if (previous?.lookChange !== person.lookChange) { person.lookChangeApproved = false; person.lookChangeReviewed = false; }
    })));
    invalidateComposition(comic);
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
    const missing = missingApprovals(comic.cast, comic.objects);
    if (missing.length) throw new UserFacingError(`Approve these designs first: ${missing.join(", ")}.`, 409);
    const ledger = buildLedger(comic.script, comic.cast, comic.objects);
    const unresolved = ledger.issues.filter(issue => issue.severity === "hard" && !issue.fixed);
    if (unresolved.length) throw new UserFacingError(unresolved.map(issue => `${issue.key}: ${issue.message}`).join(" "), 409);
    await saveComic({ ...comic, script: ledger.script, stage: "drawing", qa: { version: 1, pictures: {} } });
  });
}

const LetteringEdit = z.object({
  pages: z.array(z.object({ panels: z.array(PanelSchema.pick({ caption: true, captionPos: true, dialogue: true, sfx: true, sfxPos: true })) })),
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
    invalidateComposition(comic);
    await saveComic({ ...comic, script });
    return script;
  });
}
