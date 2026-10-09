import assert from "node:assert/strict";
import { test } from "node:test";
import { createDrawingService } from "../src/lib/drawing-service";
import { artRevision, comicRevision, exportReady, pageRevision } from "../src/lib/qa/state";
import { decide, type PanelVerdict } from "../src/lib/qa/visual-qa";
import type { Comic } from "../src/lib/comic";
import { recordUsage } from "../src/lib/meter";

const pass: PanelVerdict = { checks: [{ dimension: "SCENE_MATCH", status: "pass", note: "correct" }], failures: [], confidence: "high", fix: "" };
const fail: PanelVerdict = { ...pass, failures: [{ failure: "MAIN_VEHICLE_COLOUR_DRIFT", what: "wrong paint" }], fix: "Use the white car" };
function fixture(): Comic {
  return { id: "11111111-1111-4111-8111-111111111111", story: "Test", styleId: "pop", createdAt: "", updatedAt: "", status: "ready", stage: "drawing", cast: [], objects: [], qa: { version: 1, pictures: {} }, script: { title: "Test", tagline: "", bible: null, characters: [], cover: null, pages: [{ layout: "two-tier", panels: [0, 1].map(() => ({ scene: "A quiet landscape", shot: "wide", caption: "", dialogue: [], complexity: "low", safeShot: "A simple eye-level landscape", context: { location: "Garden", event: "Walk", period: "Today", weather: "clear", timeOfDay: "noon", cast: [], objects: [], continuity: "" } })) }] } };
}
function harness(verdicts: (PanelVerdict | Error)[] = [pass]) {
  let comic = fixture();
  const images = new Map<string, Buffer>(); const candidates = new Map<string, Buffer>();
  const prompts: string[] = []; let checks = 0;
  let lock: Promise<unknown> = Promise.resolve();
  const deps = {
    loadComic: async () => structuredClone(comic),
    saveComic: async (value: Comic) => { comic = structuredClone(value); },
    loadImage: async (_: string, key: string) => images.get(key) ?? null,
    saveImage: async (_: string, key: string, value: Buffer) => { images.set(key, value); },
    loadQaFile: async (_: string, key: string) => candidates.get(key) ?? null,
    saveQaFile: async (_: string, key: string, value: Buffer) => { candidates.set(key, value); },
    withComicLock: <T>(_id: string, fn: () => Promise<T>): Promise<T> => { const next = lock.catch(() => {}).then(fn); lock = next; return next; },
    qaReferences: async () => [],
    drawImage: async (job: { prompt: string }) => { prompts.push(job.prompt); recordUsage({ provider: "openai", model: "fake", operation: "image", usd: .01, measured: true }); return Buffer.from(`candidate-${prompts.length}`); },
    checkPanel: async () => { checks++; recordUsage({ provider: "anthropic", model: "fake", operation: "qa", usd: .001, measured: true }); const result = verdicts.shift() ?? pass; if (result instanceof Error) throw result; return result; },
  };
  return { get comic() { return comic; }, images, prompts, candidates, deps, get checks() { return checks; }, service: createDrawingService(deps) };
}
test("hard failures never reach accepted storage; retries persist across service restarts", async () => {
  const h = harness([fail, fail]);
  await assert.rejects(h.service.draw(h.comic.id, "1-1"), /needs another try/);
  assert.equal(h.images.size, 0); assert.equal(h.prompts.length, 2);
  assert.match(h.prompts[1], /simplified for clarity/);
  await assert.rejects(createDrawingService(h.deps).draw(h.comic.id, "1-1"), /attempts are used up/);
  assert.equal(h.prompts.length, 2);
  assert.equal(h.comic.costLog?.length, 4);
});
test("fallback is checked and accepted; duplicate requests share one operation", async () => {
  const h = harness([fail, pass]);
  await Promise.all([h.service.draw(h.comic.id, "1-1"), h.service.draw(h.comic.id, "1-1")]);
  assert.equal(h.prompts.length, 2); assert.equal(h.images.get("1-1")?.toString(), "candidate-2");
  assert.equal(h.comic.qa!.pictures["1-1"].simplified, true);
});
test("inspection errors resume the saved candidate without regenerating it", async () => {
  const h = harness([new Error("network"), pass]);
  await assert.rejects(h.service.draw(h.comic.id, "1-1"), /network/);
  assert.equal(h.images.size, 0); assert.ok(h.comic.qa!.pictures["1-1"].candidate);
  await createDrawingService(h.deps).draw(h.comic.id, "1-1");
  assert.equal(h.prompts.length, 1); assert.equal(h.checks, 2);
});
test("dependent panels cannot draw before an accepted predecessor", async () => {
  const h = harness();
  await assert.rejects(h.service.draw(h.comic.id, "1-2"), /preceding/);
  assert.equal(h.prompts.length, 0);
  await h.service.draw(h.comic.id, "1-1"); await h.service.draw(h.comic.id, "1-2");
  assert.match(h.prompts[1], /previous panel/);
});
test("a rejected redraw preserves old artwork and cannot restart via the same request ID", async () => {
  const h = harness([pass, fail, fail]); await h.service.draw(h.comic.id, "1-1");
  const old = h.images.get("1-1"); const accepted = h.comic.qa!.pictures["1-1"].accepted!;
  const options = { redraw: true, requestId: "redraw-once", expectedDigest: accepted.digest, feedback: "more dramatic" };
  await assert.rejects(h.service.draw(h.comic.id, "1-1", options));
  assert.deepEqual(h.images.get("1-1"), old); assert.deepEqual(h.comic.qa!.pictures["1-1"].accepted, accepted);
  await assert.rejects(h.service.draw(h.comic.id, "1-1", options)); assert.equal(h.prompts.length, 3);
});
test("uncertain inspections escalate once and cannot pass", () => {
  const uncertain = { ...pass, confidence: "medium" as const };
  assert.equal(decide({ verdict: uncertain, attempt: 1, complexity: "low", hasSafeShot: true, escalated: false }), "escalate");
  assert.equal(decide({ verdict: uncertain, attempt: 1, complexity: "low", hasSafeShot: true, escalated: true }), "flag");
});
test("export requires current accepted art and final QA; lettering only invalidates composition", async () => {
  const h = harness(); await h.service.draw(h.comic.id, "1-1"); await h.service.draw(h.comic.id, "1-2");
  const comic = structuredClone(h.comic); assert.equal(exportReady(comic), false);
  comic.qa!.pages = { "1": { revision: pageRevision(comic, "1"), status: "accepted", findings: [], at: "" } };
  comic.qa!.final = { revision: comicRevision(comic), status: "accepted", findings: [], at: "" };
  assert.equal(exportReady(comic), true);
  const art = artRevision(comic), page = pageRevision(comic, "1");
  comic.script!.pages[0].panels[0].caption = "New caption";
  assert.equal(artRevision(comic), art); assert.notEqual(pageRevision(comic, "1"), page); assert.equal(exportReady(comic), false);
  const legacy = fixture(); delete legacy.qa; assert.equal(exportReady(legacy), true);
});
test("new manual retry starts a budget only after an explicit blocked retry request", async () => {
  const h = harness([fail, fail, pass]); await assert.rejects(h.service.draw(h.comic.id, "1-1"));
  await h.service.draw(h.comic.id, "1-1", { restart: true, requestId: "explicit-new-try" });
  await h.service.draw(h.comic.id, "1-1", { restart: true, requestId: "explicit-new-try" });
  assert.equal(h.prompts.length, 3);
});
