import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { imageKeys, type Comic, type QaCheck, type QaFinding } from "../comic";
import { addCost } from "../costs";
import { drawingService } from "../drawing-service";
import { UserFacingError } from "../errors";
import { metered } from "../meter";
import { castRefsFor, ledgerFor, objectRefsFor, qaReferences } from "../picture-context";
import { loadComic, loadImage, loadQaFile, saveComic, saveQaFile, withComicLock } from "../storage";
import { getStyle } from "../styles";
import { artRevision, comicRevision, exportReady, pageRevision } from "./state";
import { checkSequence, contactSheet, sequenceBlockers, sequenceFacts, type QaReference, type SequenceVerdict } from "./visual-qa";

const globalQa = globalThis as typeof globalThis & { qaFlights?: Map<string, Promise<unknown>> };
const flights = globalQa.qaFlights ??= new Map();
function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  if (flights.has(key)) return flights.get(key) as Promise<T>;
  const task = run(); flights.set(key, task);
  void task.finally(() => flights.delete(key)).catch(() => {});
  return task;
}
async function requireComic(id: string, revision?: string): Promise<Comic> {
  const comic = await loadComic(id);
  if (!comic?.script) throw new UserFacingError("Comic not found.", 404);
  if (revision && comicRevision(comic) !== revision) throw new UserFacingError("The comic changed. Run the checks again.", 409);
  return comic;
}
export function qaStatus(comic: Comic) {
  const revision = comicRevision(comic);
  const art = artRevision(comic);
  const { entries } = comic.script ? ledgerFor(comic) : { entries: [] };
  const pages = [...(comic.script?.cover ? ["cover"] : []), ...(comic.script?.pages.map((_, p) => String(p + 1)) ?? [])];
  return {
    required: comic.qa?.version === 1, revision, ready: exportReady(comic),
    dependencies: Object.fromEntries(entries.filter(e => e.continuesFrom).map(e => [e.key, e.continuesFrom])),
    pictures: Object.fromEntries(Object.entries(comic.qa?.pictures ?? {}).map(([key, record]) => [key, { status: record.status, accepted: record.accepted?.revision === art, digest: record.accepted?.digest, attempts: record.attempts, notes: record.notes }])),
    pages: Object.fromEntries(pages.map(page => { const check = comic.qa?.pages?.[page]; return [page, check?.revision === pageRevision(comic, page) ? check : null]; })),
    final: comic.qa?.final,
    open: openFindings(comic),
  };
}
/** Current problems the automatic fixes couldn't solve, once each. */
function openFindings(comic: Comic): QaFinding[] {
  const pages = Object.entries(comic.qa?.pages ?? {}).filter(([page, check]) => check.revision === pageRevision(comic, page)).flatMap(([, check]) => check.open ?? []);
  const final = comic.qa?.final?.revision === comicRevision(comic) ? comic.qa.final.open ?? [] : [];
  return [...new Map([...pages, ...final].map(f => [`${f.key}/${f.what}`, f])).values()];
}
async function inspect(comic: Comic, input: Parameters<typeof checkSequence>[0]): Promise<SequenceVerdict> {
  const measured = await metered(async () => {
    try {
      let verdict = await checkSequence(input);
      if (verdict.confidence !== "high") verdict = await checkSequence({ ...input, effort: "high" });
      return { verdict };
    } catch (error) { return { error }; }
  });
  if (measured.usage.length) await withComicLock(comic.id, async () => {
    const latest = await requireComic(comic.id);
    addCost(latest, "qa", input.label, measured.usage); await saveComic(latest);
  });
  if ("error" in measured.result) throw measured.result.error;
  return measured.result.verdict!;
}
async function referencesFor(comic: Comic, keys: string[]) {
  const { entries } = ledgerFor(comic);
  const people = [...new Map(entries.filter(e => keys.includes(e.key)).flatMap(e => e.people).map(p => [`${p.name}/${p.stage}`, p])).values()];
  const objects = [...new Map(entries.filter(e => keys.includes(e.key)).flatMap(e => e.objects).map(o => [o.id, o])).values()];
  if (keys.includes("cover")) {
    for (const member of comic.cast ?? []) if (!people.some(p => p.name === member.name)) people.push({ name: member.name, stage: "", wardrobe: "cover wardrobe", wardrobeFromSheet: member.lookPolicy !== "story" });
    for (const object of comic.objects ?? []) if (!objects.some(o => o.id === object.id)) objects.push({ id: object.id, name: object.name });
  }
  return qaReferences(comic, { key: "", pageIndex: 0, panelIndex: 0, location: "", people, objects, complexity: "medium" }, objectRefsFor(comic), castRefsFor(comic));
}
function factsFor(comic: Comic, keys: string[]) {
  const { script, entries } = ledgerFor(comic);
  return sequenceFacts(script, entries, comic.objects ?? [], keys) + (keys.includes("cover") ? `\n[cover] ${script.cover?.scene}; title ${script.title}; canon ${JSON.stringify(comic.objects ?? [])}` : "");
}
async function saveCheck(id: string, revision: string, fn: (comic: Comic) => void) {
  return withComicLock(id, async () => { const latest = await requireComic(id, revision); fn(latest); await saveComic(latest); });
}
/** Redraws the pictures with hard findings. True when at least one new picture passed its check. */
async function repair(comic: Comic, blockers: QaFinding[]): Promise<boolean> {
  let changed = false;
  for (const key of [...new Set(blockers.map(f => f.key))]) {
    if (!imageKeys(comic.script!).includes(key)) continue;
    const before = comic.qa?.pictures[key]?.accepted?.digest;
    try { await drawingService.draw(comic.id, key, { repair: blockers.filter(f => f.key === key).map(f => f.fix || f.what).join("; ") }); }
    catch (error) { if (!(error instanceof UserFacingError && [422, 425].includes(error.status))) throw error; }
    if ((await requireComic(comic.id)).qa?.pictures[key]?.accepted?.digest !== before) changed = true;
  }
  return changed;
}
export async function checkPage(id: string, revision: string, page: string, data: Buffer) {
  return once(`${id}/page/${page}/${revision}`, async () => {
    const comic = await requireComic(id, revision);
    if (!comic.qa?.version) return qaStatus(comic);
    const keys = page === "cover" && comic.script!.cover ? ["cover"] : comic.script!.pages[Number(page) - 1]?.panels.map((_, i) => `${page}-${i + 1}`);
    if (!keys?.length) throw new UserFacingError("Page not found.", 404);
    const targetRevision = pageRevision(comic, page);
    if (comic.qa.pages?.[page]?.revision === targetRevision && comic.qa.pages[page].status === "accepted") return qaStatus(comic);
    if (keys.some(key => comic.qa!.pictures[key]?.accepted?.revision !== artRevision(comic))) throw new UserFacingError("Finish checking the pictures first.", 409);
    const metadata = await sharp(data, { limitInputPixels: 16_000_000 }).metadata();
    if (metadata.width !== 1600 || metadata.height !== 2400) throw new UserFacingError("Send the full rendered page.", 400);
    const image = await sharp(data).jpeg({ quality: 90 }).toBuffer();
    const file = `${randomUUID()}.jpg`;
    await saveQaFile(id, file, image);
    try {
      const references = await referencesFor(comic, keys);
      // Close-ups prevent full-page downscaling from hiding identity defects.
      for (const key of keys) { const data = await loadImage(id, key); if (data) references.push({ label: `Close-up of picture ${key}`, data }); }
      const verdict = await inspect(comic, { pageImage: image, label: `Lettered page ${page}; panels in reading order: ${keys.join(", ")}`, facts: factsFor(comic, keys), style: getStyle(comic.styleId)!, references });
      const blockers = sequenceBlockers(verdict, keys);
      const check: QaCheck = { revision: targetRevision, status: blockers.length ? "blocked" : "accepted", findings: verdict.findings, notes: verdict.notes, at: new Date().toISOString() };
      await saveCheck(id, revision, latest => { latest.qa!.pages ??= {}; latest.qa!.pages[page] = { ...check, file }; latest.qa!.final = undefined; });
      // When no fix passed its own check, checking again can't change anything: finish with the problems listed.
      if (blockers.length && !(await repair(comic, blockers))) await saveCheck(id, revision, latest => { latest.qa!.pages![page] = { ...latest.qa!.pages![page], status: "accepted", open: blockers }; });
    } catch (error) {
      await saveCheck(id, revision, latest => { latest.qa!.pages ??= {}; latest.qa!.pages[page] = { revision: targetRevision, status: "error", findings: [], notes: "Page inspection interrupted. Retry checks.", at: new Date().toISOString() }; latest.qa!.final = undefined; }).catch(() => {});
      throw error;
    }
    return qaStatus(await requireComic(id));
  });
}
export async function checkFinal(id: string, revision: string) {
  return once(`${id}/final/${revision}`, async () => {
    const comic = await requireComic(id, revision);
    if (exportReady(comic)) return qaStatus(comic);
    const pages = [...(comic.script!.cover ? ["cover"] : []), ...comic.script!.pages.map((_, i) => String(i + 1))];
    if (pages.some(page => comic.qa?.pages?.[page]?.status !== "accepted" || comic.qa.pages[page].revision !== pageRevision(comic, page))) throw new UserFacingError("Check each finished page before the final review.", 409);
    const findings: QaFinding[] = [];
    const blockers: QaFinding[] = [];
    try {
      // Sliding adjacent pairs include every page boundary at readable resolution.
      const keys = imageKeys(comic.script!);
      for (let i = 0; i < keys.length - 1; i += 3) {
        const pair = keys.slice(i, i + 4);
        const pairRevision = digestPair(comic, pair);
        const cached = comic.qa?.sequences?.[pair.join("/")];
        if (cached?.revision === pairRevision && cached.status === "accepted") continue;
        const pictures = await Promise.all(pair.map(async key => ({ key, data: (await loadImage(id, key))! })));
        if (pictures.some(p => !p.data)) throw new UserFacingError("A picture is missing.", 409);
        const verdict = await inspect(comic, { pageImage: await contactSheet(pictures, 700, 2), label: `Adjacent pictures ${pair.join(" → ")}`, facts: factsFor(comic, pair), style: getStyle(comic.styleId)!, references: await referencesFor(comic, pair) });
        const pairBlockers = sequenceBlockers(verdict, pair);
        findings.push(...verdict.findings); blockers.push(...pairBlockers);
        await saveCheck(id, revision, latest => { latest.qa!.sequences ??= {}; latest.qa!.sequences[pair.join("/")] = { revision: pairRevision, status: pairBlockers.length ? "blocked" : "accepted", findings: verdict.findings, at: new Date().toISOString() }; });
      }
      // Whole-book audit in readable page batches. Each batch sees the complete plan and canon,
      // plus earlier appearances of recurring identities instead of tiny whole-book thumbnails.
      const overview = factsFor(comic, keys);
      const { entries } = ledgerFor(comic);
      const firstKeys = new Set<string>();
      for (const object of comic.objects ?? []) { const first = entries.find(e => e.objects.some(o => o.id === object.id)); if (first) firstKeys.add(first.key); }
      for (const person of comic.cast ?? []) { const first = entries.find(e => e.people.some(p => p.name === person.name)); if (first) firstKeys.add(first.key); }
      for (let i = 0; i < pages.length; i += 2) {
        const batch = pages.slice(i, i + 2);
        // A batch that passed is only read again when its pages or the earlier appearances it is compared with change.
        const batchRevision = `${batch.map(page => pageRevision(comic, page)).join(":")}:${digestPair(comic, [...firstKeys])}`;
        const cached = comic.qa?.sequences?.[`book/${batch.join("/")}`];
        if (cached?.revision === batchRevision && cached.status === "accepted") continue;
        const images = await Promise.all(batch.map(async page => ({ key: page, data: await loadQaFile(id, comic.qa!.pages![page].file!) })));
        if (images.some(image => !image.data)) throw new UserFacingError("A checked page is missing. Check pages again.", 409);
        const batchKeys = keys.filter(key => key === "cover" ? batch.includes("cover") : batch.includes(key.split("-")[0]));
        const refs: QaReference[] = await referencesFor(comic, batchKeys);
        for (const image of images.slice(1)) refs.push({ label: `Lettered page ${image.key}`, data: image.data! });
        for (const key of firstKeys) { const data = await loadImage(id, key); if (data) refs.push({ label: `Earlier established appearance in ${key}: ${factsFor(comic, [key])}`, data }); }
        const verdict = await inspect(comic, { pageImage: images[0].data!, label: `Final book audit: page ${batch[0]}. Additional pages ${batch.slice(1).join(", ") || "none"}. Report picture keys, not page numbers.`, facts: `Complete storyboard and ledger:\n${overview}\nInspect these pictures: ${batchKeys.join(", ")}`, style: getStyle(comic.styleId)!, references: refs });
        const batchBlockers = sequenceBlockers(verdict, keys);
        findings.push(...verdict.findings); blockers.push(...batchBlockers);
        await saveCheck(id, revision, latest => { latest.qa!.sequences ??= {}; latest.qa!.sequences[`book/${batch.join("/")}`] = { revision: batchRevision, status: batchBlockers.length ? "blocked" : "accepted", findings: verdict.findings, at: new Date().toISOString() }; });
      }
      const pagesOpen = pages.flatMap(page => comic.qa!.pages![page].open ?? []);
      await saveCheck(id, revision, latest => { latest.qa!.final = { revision, status: blockers.length ? "blocked" : "accepted", findings, open: pagesOpen, at: new Date().toISOString() }; });
      // Same as pages: if nothing could be fixed, the review finishes with the problems listed.
      if (blockers.length && !(await repair(comic, blockers))) await saveCheck(id, revision, latest => { latest.qa!.final = { ...latest.qa!.final!, status: "accepted", open: [...pagesOpen, ...blockers] }; });
    } catch (error) {
      await saveCheck(id, revision, latest => { latest.qa!.final = { revision, status: "error", findings, notes: "Final inspection interrupted. Retry checks.", at: new Date().toISOString() }; }).catch(() => {});
      throw error;
    }
    return qaStatus(await requireComic(id));
  });
}
function digestPair(comic: Comic, keys: string[]) {
  return `${artRevision(comic)}:${keys.map(key => comic.qa?.pictures[key]?.accepted?.digest).join(":")}`;
}
