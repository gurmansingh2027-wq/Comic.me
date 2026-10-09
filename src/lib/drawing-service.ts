import "server-only";
import { randomUUID } from "node:crypto";
import { drawingApproved, imageKeys, type Comic, type CostItem, type PictureQa } from "./comic";
import { addCost } from "./costs";
import { coverJob, coverObjects, drawImage, panelJob } from "./engines/art";
import { UserFacingError } from "./errors";
import { metered } from "./meter";
import { castRefsFor, ledgerFor, objectRefsFor, qaReferences } from "./picture-context";
import type { LedgerEntry } from "./continuity";
import { artRevision, digest, invalidateComposition } from "./qa/state";
import { checkPanel, decide, maxAttempts, panelFacts } from "./qa/visual-qa";
import { imagePath, loadComic, loadImage, loadQaFile, saveComic, saveImage, saveQaFile, withComicLock } from "./storage";
import { getStyle } from "./styles";

const defaults = { loadComic, loadImage, loadQaFile, saveComic, saveImage, saveQaFile, withComicLock, drawImage, checkPanel, qaReferences };
type Options = { restart?: boolean; redraw?: boolean; requestId?: string; expectedDigest?: string; feedback?: string; repair?: string };
const shared = globalThis as typeof globalThis & { pictureFlights?: Map<string, Promise<void>> };

export function createDrawingService(overrides: Partial<typeof defaults> = {}, flights = new Map<string, Promise<void>>()) {
  const deps = { ...defaults, ...overrides };
  async function update(id: string, fn: (comic: Comic) => void | Promise<void>) {
    return deps.withComicLock(id, async () => {
      const comic = await deps.loadComic(id);
      if (!comic?.script) throw new UserFacingError("Comic not found.", 404);
      await fn(comic);
      await deps.saveComic(comic);
      return comic;
    });
  }
  async function billed<T>(id: string, item: CostItem, detail: string, fn: () => Promise<T>): Promise<T> {
    const { result, usage } = await metered(async () => {
      try { return { value: await fn() }; } catch (error) { return { error }; }
    });
    if (usage.length) await update(id, comic => { addCost(comic, item, detail, usage); });
    if ("error" in result) throw result.error;
    return result.value as T;
  }
  async function run(id: string, key: string, options: Options) {
    let comic = await deps.loadComic(id);
    if (!comic?.script || !imageKeys(comic.script).includes(key)) throw new UserFacingError("Picture not found.", 404);
    if (!drawingApproved(comic)) throw new UserFacingError("Approve the storyboard before drawing.", 409);
    const revision = artRevision(comic);
    const style = getStyle(comic.styleId)!;
    const { script, entries, issues } = ledgerFor(comic);
    if (issues.some(issue => issue.severity === "hard" && !issue.fixed) && comic.qa?.version) throw new UserFacingError("Review the storyboard continuity before drawing.", 409);
    const objectRefs = objectRefsFor(comic);
    const castRefs = castRefsFor(comic);
    const coverScene = script.cover?.scene ?? "";
    const entry: LedgerEntry | undefined = key === "cover" ? {
      key, pageIndex: -1, panelIndex: -1, location: "", complexity: "high",
      objects: coverObjects(coverScene, objectRefs),
      people: (comic.cast ?? []).filter(member => member.importance === "main" || coverScene.toLowerCase().includes(member.name.toLowerCase())).map(member => {
        const first = entries.flatMap(entry => entry.people).find(person => person.name === member.name);
        return first ? { ...first, inside: undefined } : { name: member.name, stage: "", wardrobe: "clothes matching the cover", wardrobeFromSheet: member.lookPolicy === "keep" || member.lookPolicy === "ask" };
      }),
    } : entries.find(entry => entry.key === key);
    const [p, i] = key.split("-").map(Number).map(n => n - 1);
    const panel = key === "cover" ? undefined : script.pages[p].panels[i];
    if (panel && !panel.safeShot) panel.safeShot = `Use a simple eye-level view, minimal background, clear silhouettes and physically plausible placement to show this same beat: ${panel.scene}`;
    const complexity = entry?.complexity ?? "medium";
    const limit = maxAttempts(complexity);
    // Independent scenes can run together; a continuation waits for its accepted predecessor.
    if (entry?.continuesFrom) {
      const earlierFlight = flights.get(`${id}/${entry.continuesFrom}`);
      if (earlierFlight) await earlierFlight;
      comic = (await deps.loadComic(id))!;
      const accepted = comic.qa?.pictures[entry.continuesFrom]?.accepted;
      if (comic.qa?.version && accepted?.revision !== revision) throw new UserFacingError("Waiting for the preceding picture.", 425);
    }
    const references = await deps.qaReferences(comic, entry, objectRefs, castRefs);
    const previous = entry?.continuesFrom ? await deps.loadImage(id, entry.continuesFrom) : null;
    const previousPath = previous && entry?.continuesFrom ? imagePath(id, entry.continuesFrom) : undefined;
    const neighbours = panel ? `\nNext intent: ${entries[entries.findIndex(e => e.key === key) + 1] ? script.pages[entries[entries.findIndex(e => e.key === key) + 1].pageIndex].panels[entries[entries.findIndex(e => e.key === key) + 1].panelIndex].scene : "End of comic"}` : "";
    const facts = panel ? panelFacts(panel, entry, comic.objects ?? []) + neighbours : `Cover intent: ${coverScene}\nTitle: ${script.title}\n${panelFacts({ shot: "wide", scene: coverScene, caption: "", dialogue: [] }, entry, comic.objects ?? [])}`;
    const existing = await deps.loadImage(id, key);
    let done = false;
    comic = await update(id, latest => {
      latest.qa ??= { pictures: {} };
      const old = latest.qa.pictures[key];
      if (!options.redraw && !options.repair && existing && (!latest.qa.version || old?.accepted?.revision === revision)) { done = true; return; }
      if (options.redraw && (!options.requestId || !existing)) throw new UserFacingError("Choose an existing picture to redraw.", 409);
      if ((options.redraw || options.restart) && old?.requestId !== options.requestId) {
        if (options.restart && (!options.requestId || old?.status !== "blocked")) throw new UserFacingError("Resume the existing attempt first.", 409);
        if (options.redraw && latest.qa.version && options.expectedDigest !== (old?.accepted?.digest ?? (existing ? digest(existing) : undefined))) throw new UserFacingError("This picture changed. Refresh before redrawing.", 409);
        latest.qa.pictures[key] = { attempts: 0, status: "checking", revision, findings: [], at: new Date().toISOString(), requestId: options.requestId, accepted: old?.accepted };
      } else if (!old) latest.qa.pictures[key] = { attempts: 0, status: "checking", revision, findings: [], at: new Date().toISOString() };
      else if (old.revision !== revision) throw new UserFacingError("The drawing plan changed. Review it before retrying.", 409);
      else if ((options.redraw || options.restart) && old.status === "accepted") done = true;
      if (options.repair) {
        const record = latest.qa.pictures[key];
        record.candidate = undefined;
        record.notes = options.repair;
        record.status = "blocked";
      }
    });
    if (done) return;
    const writeRecord = async (patch: Partial<PictureQa>) => {
      comic = await update(id, latest => {
        if (artRevision(latest) !== revision) throw new UserFacingError("The drawing plan changed.", 409);
        Object.assign(latest.qa!.pictures[key], patch, { at: new Date().toISOString() });
      });
    };
    try {
      for (;;) {
        let record = comic.qa!.pictures[key];
        let candidate = record.candidate ? await deps.loadQaFile(id, record.candidate) : null;
        if (!candidate) {
          if (record.attempts >= limit) {
            await writeRecord({ status: "blocked", notes: "This picture needs another try." });
            throw new UserFacingError("This picture needs another try. Automatic attempts are used up.", 422);
          }
          const attempt = record.attempts + 1;
          const simplified = attempt === limit;
          await writeRecord({ attempts: attempt, status: "generating", simplified, escalated: false });
          const retry = attempt > 1 || options.repair ? { fix: record.notes || options.repair || "Preserve all canon details and the story beat.", safe: simplified } : undefined;
          const revisionInput = options.redraw && existing ? { currentPath: imagePath(id, key), feedback: options.feedback ?? "" } : undefined;
          const job = key === "cover" ? coverJob(script, style, castRefs, revisionInput, objectRefs, retry, entry) : panelJob(script, p, i, style, castRefs, revisionInput, { objectRefs, entry, previousPanelPath: previousPath, retry });
          candidate = await billed(id, options.redraw || attempt > 1 || options.repair ? "redraw" : "picture", `${key} attempt ${attempt}${simplified ? " safe composition" : ""}`, () => deps.drawImage(job));
          const file = `${randomUUID()}.webp`;
          await deps.saveQaFile(id, file, candidate);
          await writeRecord({ candidate: file, status: "checking" });
        }
        record = comic.qa!.pictures[key];
        let escalated = !!record.escalated;
        let verdict = await billed(id, "qa", `${key} ${escalated ? "high" : "low"}`, () => deps.checkPanel({ image: candidate!, facts, style, references, previous: previous ?? undefined, effort: escalated ? "high" : "low" }));
        let decision = decide({ verdict, attempt: record.attempts, complexity, hasSafeShot: true, escalated });
        if (decision === "escalate") {
          escalated = true;
          await writeRecord({ escalated });
          verdict = await billed(id, "qa", `${key} high`, () => deps.checkPanel({ image: candidate!, facts, style, references, previous: previous ?? undefined, effort: "high" }));
          decision = decide({ verdict, attempt: record.attempts, complexity, hasSafeShot: true, escalated });
        }
        const findings = verdict.failures.map(finding => ({ ...finding, key, fix: verdict.fix }));
        if (decision === "accept") {
          await update(id, async latest => {
            if (artRevision(latest) !== revision) throw new UserFacingError("The drawing plan changed.", 409);
            invalidateComposition(latest);
            await deps.saveComic(latest);
            await deps.saveImage(id, key, candidate!);
            latest.qa!.pictures[key] = { ...latest.qa!.pictures[key], status: "accepted", candidate: undefined, findings, notes: verdict.fix, accepted: { digest: digest(candidate!), revision, at: new Date().toISOString() }, at: new Date().toISOString() };
            invalidateComposition(latest);
            if (options.redraw) latest.redraws = (latest.redraws ?? 0) + 1;
          });
          return;
        }
        await writeRecord({ findings, notes: verdict.fix || "The inspector could not confirm this picture.", status: "blocked", candidate: undefined });
        if (decision === "flag") throw new UserFacingError("This picture needs another try. We could not confirm its continuity.", 422);
      }
    } catch (error) {
      if (!(error instanceof UserFacingError && error.status === 422)) await writeRecord({ status: "error", notes: "Drawing or inspection was interrupted. Retry to resume." });
      throw error;
    }
  }
  return {
    draw(id: string, key: string, options: Options = {}): Promise<void> {
      const flightKey = `${id}/${key}`;
      const existing = flights.get(flightKey);
      if (existing) return existing;
      const promise = run(id, key, options);
      flights.set(flightKey, promise);
      void promise.finally(() => { if (flights.get(flightKey) === promise) flights.delete(flightKey); }).catch(() => {});
      return promise;
    },
  };
}
export const drawingService = createDrawingService(defaults, shared.pictureFlights ??= new Map());
