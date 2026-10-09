import { withAuditBudget, readAuditBudget } from "@/lib/qa/budget";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CanonObject } from "@/lib/comic";
import { metered } from "@/lib/meter";
import { castRefsFor, ledgerFor, objectRefsFor, qaReferences } from "@/lib/picture-context";
import { checkPanel, decide, hardFailures, panelFacts } from "@/lib/qa/visual-qa";
import { imagePath, loadComic, loadImage } from "@/lib/storage";
import { getStyle } from "@/lib/styles";

export const runtime = "nodejs";
export const maxDuration = 800;

type Fixture = {
  comicId: string;
  objects: (Omit<CanonObject, "designAttempts"> & { referenceKey?: string })[];
  cases: { key: string; expect: string[] }[];
};

/**
 * Developer tool (COMICME_DEV_TOOLS=1 only): runs visual QA over a labelled failure dataset and
 * reports what it caught. Paid (Claude vision calls), never draws anything.
 */
export async function POST(request: Request) {
  if (process.env.COMICME_DEV_TOOLS !== "1") return new Response("Not found", { status: 404 });
  const { only, effort = "low" } = (await request.json().catch(() => ({}))) as { only?: string[]; effort?: "low" | "high" };
  const fixture = "research/fixtures/corners-failures.json";
  if ((effort !== "low" && effort !== "high") || !Array.isArray(only) || !only.length || only.length > 10 || only.some(key => typeof key !== "string")) return Response.json({ error: "Choose 1–10 fixture keys and low/high effort." }, { status: 400 });
  const data = JSON.parse(await readFile(path.join(process.cwd(), fixture), "utf8")) as Fixture;
  const comic = await loadComic(data.comicId);
  if (!comic?.script) return Response.json({ error: "Comic not found in this storage" }, { status: 404 });
  const style = getStyle(comic.styleId)!;
  const objects = data.objects.map((object) => ({ ...object, designAttempts: 0 }));
  // The fixture's canon objects use an early panel of the comic as their reference sheet.
  const objectRefs = objectRefsFor(comic, objects).map((ref) => {
    const key = data.objects.find((o) => o.id === ref.id)?.referenceKey;
    return key ? { ...ref, designPath: imagePath(comic.id, key) } : ref;
  });
  const castRefs = castRefsFor(comic);
  const { script, entries } = ledgerFor({ ...comic, objects }, objects);
  const results = [];
  for (const testCase of data.cases.filter((c) => !only || only.includes(c.key))) {
    const [p, i] = testCase.key.split("-").map((n) => Number(n) - 1);
    const panel = script.pages[p].panels[i];
    const entry = entries.find((e) => e.key === testCase.key);
    const image = await loadImage(comic.id, testCase.key);
    if (!image) continue;
    const flatIndex = entries.findIndex((e) => e.key === testCase.key);
    const previous = flatIndex > 0 ? await loadImage(comic.id, entries[flatIndex - 1].key) : null;
    const references = (await qaReferences(comic, entry, objectRefs, castRefs)).filter((ref) => !ref.label.includes(testCase.key));
    const started = Date.now();
    const { result: verdict, usage } = await withAuditBudget(() => metered(() =>
      checkPanel({ image, facts: panelFacts(panel, entry, objects), style, references, previous: previous ?? undefined, effort }),
    ));
    const found = hardFailures(verdict);
    results.push({
      key: testCase.key,
      expect: testCase.expect,
      found,
      soft: verdict.failures.filter((f) => !found.includes(f.failure)).map((f) => f.failure),
      caught: testCase.expect.length === 0 ? found.length === 0 : testCase.expect.some(cls => found.includes(cls as never)),
      exactClass: testCase.expect.some((cls) => found.includes(cls as never)),
      decision: decide({ verdict, attempt: 1, complexity: entry?.complexity ?? "medium", hasSafeShot: true, escalated: effort === "high" }),
      confidence: verdict.confidence,
      what: verdict.failures.map((f) => `${f.failure}: ${f.what}`),
      fix: verdict.fix,
      seconds: Math.round((Date.now() - started) / 1000),
      usd: usage.reduce((sum, u) => sum + u.usd, 0),
      references: references.map((r) => r.label.slice(0, 60)),
    });
  }
  const bad = results.filter((r) => r.expect.length > 0);
  const good = results.filter((r) => r.expect.length === 0);
  return Response.json({
    budget: await readAuditBudget(),
    summary: {
      failuresCaught: `${bad.filter((r) => r.caught).length}/${bad.length}`,
      exactClass: `${bad.filter((r) => r.exactClass).length}/${bad.length}`,
      cleanPassed: `${good.filter((r) => r.caught).length}/${good.length}`,
      usd: Number(results.reduce((sum, r) => sum + r.usd, 0).toFixed(3)),
      avgUsdPerCheck: Number((results.reduce((sum, r) => sum + r.usd, 0) / Math.max(1, results.length)).toFixed(4)),
      avgSeconds: Math.round(results.reduce((sum, r) => sum + r.seconds, 0) / Math.max(1, results.length)),
    },
    results,
  });
}
