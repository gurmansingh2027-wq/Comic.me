// Image-model benchmark: the same scenes, characters and styles across several models.
// See docs/comicme-benchmark.md.
//
// Run:  node scripts/benchmark.ts --comic <comic id with approved character designs> [--styles prestige,ink] [--models a,b] [--scenes 1,2]
// Output: benchmark/<run>/<model>/<style>/<scene>.png, results.json, index.html (contact sheet)
//
// Needs OPENAI_API_KEY and FAL_KEY in .env.local. Costs money: about $7–9 for the default pilot.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fal } from "@fal-ai/client";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { COMIC_STYLES } from "../src/lib/styles.ts";

// --- Setup ---------------------------------------------------------------------------------------

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const comicId = arg("comic");
if (!comicId) throw new Error("Pass --comic <id> of a comic whose characters have approved designs.");
fal.config({ credentials: env.FAL_KEY });
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 5 * 60 * 1000 });

const comicDir = path.join("storage", "comics", comicId);
const comic = JSON.parse(readFileSync(path.join(comicDir, "comic.json"), "utf8"));
type Ref = { name: string; label: string; file: string };
const refs: Record<string, Ref> = {};
for (const member of comic.cast) {
  if (member.design?.approved) refs[`${member.name}:main`] = { name: member.name, label: member.mainStage?.label ?? "adult", file: path.join(comicDir, "cast", member.design.file) };
  for (const stage of member.stages ?? []) {
    if (stage.design?.approved) refs[`${member.name}:${stage.id}`] = { name: member.name, label: stage.label, file: path.join(comicDir, "cast", stage.design.file) };
  }
}

// --- Scenes (hard cases from the 40-scene list) -----------------------------------------------

type Person = { ref: string; wearing: string; doing: string };
type Scene = { id: number; title: string; shot: string; scene: string; people: Person[] };
const SCENES: Scene[] = [
  { id: 1, title: "close-up crying", shot: "close-up", scene: "Gurman alone in a dim hospital corridor at night, tears running down his face, trying to hold it together.", people: [{ ref: "Gurman:main", wearing: "rumpled grey hoodie", doing: "wiping a tear with the back of his hand" }] },
  { id: 2, title: "from behind, city night", shot: "wide", scene: "Gurman seen from behind on a rooftop, looking out over the lights of Gurugram at night.", people: [{ ref: "Gurman:main", wearing: "dark bomber jacket and jeans", doing: "standing with hands in pockets, back to the viewer" }] },
  { id: 3, title: "two people arguing", shot: "medium", scene: "Gurman and Kabir arguing across a cluttered warehouse desk covered in sneaker boxes; Kabir is shouting.", people: [{ ref: "Gurman:main", wearing: "navy polo shirt", doing: "arms crossed, frowning, on the left" }, { ref: "Kabir:main", wearing: "grey hoodie", doing: "shouting, pointing at a laptop, on the right" }] },
  { id: 4, title: "wedding hug", shot: "medium", scene: "At a night-time Punjabi wedding under marigold lights, Kabir hugs Gurman, both laughing.", people: [{ ref: "Gurman:main", wearing: "ivory-and-gold sherwani, pink turban with a sehra tied back", doing: "laughing, hugging" }, { ref: "Kabir:main", wearing: "maroon kurta with a navy Nehru jacket", doing: "hugging Gurman, eyes closed laughing" }] },
  { id: 5, title: "kids playing cricket (age 8)", shot: "wide", scene: "Two eight-year-old boys playing cricket with a taped tennis ball in a narrow Ludhiana lane at dusk.", people: [{ ref: "Gurman:gali-cricket-kid-8", wearing: "faded blue T-shirt, khaki shorts, rubber chappals, navy patka", doing: "batting, mid-swing, on the left" }, { ref: "Kabir:gali-cricket-kid-8", wearing: "oversized yellow T-shirt, grey shorts", doing: "bowling, on the right" }] },
  { id: 6, title: "teen hero low angle", shot: "low-angle hero shot", scene: "Gurman at 17 rising for a dunk in a packed school basketball arena under floodlights.", people: [{ ref: "Gurman:school-basketball-player-17", wearing: "maroon jersey number 11, maroon turban, steel kara", doing: "leaping for a dunk, arm fully extended" }] },
  { id: 7, title: "scooter in monsoon rain", shot: "medium", scene: "Gurman rides a scooter through heavy monsoon rain on a Delhi street with Kabir on the back holding a cardboard box over their heads.", people: [{ ref: "Gurman:main", wearing: "soaked white shirt, rain-dark turban", doing: "driving, squinting through rain" }, { ref: "Kabir:main", wearing: "soaked grey hoodie", doing: "laughing, holding a box over both heads" }] },
  { id: 8, title: "then and now (two ages)", shot: "medium", scene: "Split moment: adult Gurman crouches to eye level with his eight-year-old self in the same lane, both holding the same taped tennis ball.", people: [{ ref: "Gurman:main", wearing: "olive chinos and a charcoal T-shirt", doing: "crouching, smiling softly, on the right" }, { ref: "Gurman:gali-cricket-kid-8", wearing: "faded blue T-shirt and shorts, navy patka", doing: "holding out a tennis ball, on the left" }] },
  { id: 9, title: "hands on laptop", shot: "extreme close-up", scene: "Close on Kabir's hands typing fast on a laptop at night, a coffee mug and a taped tennis ball beside it.", people: [{ ref: "Kabir:main", wearing: "grey hoodie sleeves", doing: "typing, only hands and wrists visible" }] },
  { id: 10, title: "symbolic, no people", shot: "medium", scene: "An empty wooden office chair at dawn, a taped tennis ball resting on the seat, long shadows across a concrete floor.", people: [] },
];

const NO_TEXT = "Do not draw any text, letters, logos, speech balloons or watermarks. One single illustration, no panel borders.";

function promptFor(scene: Scene, styleArt: string, referenceOffset: number, hasStyleRef: boolean) {
  const people = scene.people.map(
    (person, i) =>
      `- ${refs[person.ref].name} (${refs[person.ref].label}): reference image ${i + 1 + referenceOffset} is their character design. Keep their identity exactly (face, features, skin tone, hair, build, distinctive markers) but NOT the outfit on the sheet. Here they wear: ${person.wearing}. Doing: ${person.doing}.`,
  );
  return [
    `A single comic book panel illustration, square. Shot: ${scene.shot}.`,
    `Art style: ${styleArt}`,
    hasStyleRef && `Reference image ${scene.people.length + 1 + referenceOffset} is an example of the target art style: match its rendering, ignore its content.`,
    `Scene: ${scene.scene}`,
    people.length > 0 && `Characters:\n${people.join("\n")}`,
    NO_TEXT,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// --- Models ---------------------------------------------------------------------------------------

type Model = { id: string; label: string; price: (refs: number) => number; draw: (prompt: string, files: string[], urls: string[]) => Promise<Buffer> };

async function fetchBuffer(url: string) {
  return Buffer.from(await (await fetch(url)).arrayBuffer());
}

function openaiModel(id: string, model: string, label: string): Model {
  return {
    id,
    label,
    price: (n) => 0.053 + n * 0.01,
    draw: async (prompt, files) => {
      const image = await Promise.all(files.map((file, i) => toFile(readFileSync(file), `ref-${i}.png`, { type: "image/png" })));
      for (let attempt = 1; ; attempt++) {
        try {
          const result = await openai.images.edit({ model, image, prompt, size: "1024x1024", quality: "medium", output_format: "png" });
          return Buffer.from(result.data![0].b64_json!, "base64");
        } catch (error) {
          if (!(error instanceof OpenAI.RateLimitError) || attempt >= 8) throw error;
          await new Promise((r) => setTimeout(r, 20_000));
        }
      }
    },
  };
}

function falModel(id: string, endpoint: string, label: string, price: (n: number) => number, extra: Record<string, unknown>): Model {
  return {
    id,
    label,
    price,
    draw: async (prompt, _files, urls) => {
      const result = await fal.subscribe(endpoint, { input: { prompt, image_urls: urls, ...extra } });
      const data = result.data as { images: { url: string }[] };
      return fetchBuffer(data.images[0].url);
    },
  };
}

const MODELS: Model[] = [
  openaiModel("gpt-image-2", "gpt-image-2", "GPT Image 2 (current)"),
  openaiModel("gpt-image-2.5-flare", "gpt-image-2.5-flare", "GPT Image 2.5 Flare"),
  falModel("nano-banana-2", "fal-ai/nano-banana-2/edit", "Nano Banana 2", () => 0.08, { aspect_ratio: "1:1", resolution: "1K", output_format: "png" }),
  falModel("seedream-5-pro", "bytedance/seedream/v5/pro/edit", "Seedream 5 Pro", (n) => 0.0675 + Math.max(0, n - 1) * 0.0045, { image_size: "square_hd" }),
  falModel("flux-2-pro", "fal-ai/flux-2-pro/edit", "FLUX.2 Pro", (n) => 0.03 + n * 0.015, { image_size: "square_hd", output_format: "png" }),
];

// --- Run ------------------------------------------------------------------------------------------

const styles = (arg("styles") ?? "prestige,ink").split(",").map((id) => COMIC_STYLES.find((s) => s.id === id)!).filter(Boolean);
const modelIds = arg("models")?.split(",");
const models = MODELS.filter((m) => !modelIds || modelIds.includes(m.id));
const sceneIds = arg("scenes")?.split(",").map(Number);
const scenes = SCENES.filter((s) => !sceneIds || sceneIds.includes(s.id));
const run = arg("run") ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const outDir = path.join("benchmark", run);
mkdirSync(outDir, { recursive: true });

// Reference pictures: shrink to ~1 megapixel (cheaper for per-megapixel pricing) and upload once to fal.
const refCache = new Map<string, { file: string; url: string }>();
async function prepared(file: string) {
  if (!refCache.has(file)) {
    const small = path.join(outDir, `ref-${path.basename(file).replace(/\.\w+$/, "")}.png`);
    if (!existsSync(small)) writeFileSync(small, await sharp(file).resize(1024, 1024, { fit: "inside" }).png().toBuffer());
    const url = await fal.storage.upload(new Blob([readFileSync(small)], { type: "image/png" }));
    refCache.set(file, { file: small, url });
  }
  return refCache.get(file)!;
}

type Result = { model: string; style: string; scene: number; ok: boolean; seconds: number; usd: number; error?: string; file?: string };
const resultsFile = path.join(outDir, "results.json");
const results: Result[] = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, "utf8")) : [];

async function one(model: Model, style: (typeof styles)[number], scene: Scene) {
  const file = path.join(outDir, model.id, style.id, `${scene.id}.png`);
  if (existsSync(file)) return;
  mkdirSync(path.dirname(file), { recursive: true });
  const sample = path.join("public", "styles", `${style.id}.webp`);
  const refFiles = [...scene.people.map((p) => refs[p.ref].file), sample];
  const prepared_ = await Promise.all(refFiles.map(prepared));
  const prompt = promptFor(scene, style.art, 0, true);
  const started = Date.now();
  try {
    const image = await model.draw(prompt, prepared_.map((r) => r.file), prepared_.map((r) => r.url));
    writeFileSync(file, image);
    results.push({ model: model.id, style: style.id, scene: scene.id, ok: true, seconds: (Date.now() - started) / 1000, usd: model.price(refFiles.length), file: path.relative(outDir, file) });
    console.log(`✓ ${model.id} · ${style.id} · ${scene.id}. ${scene.title} (${Math.round((Date.now() - started) / 1000)}s)`);
  } catch (error) {
    results.push({ model: model.id, style: style.id, scene: scene.id, ok: false, seconds: (Date.now() - started) / 1000, usd: 0, error: String((error as Error).message ?? error).slice(0, 300) });
    console.log(`✗ ${model.id} · ${style.id} · ${scene.id}: ${(error as Error).message?.slice(0, 160)}`);
  }
  writeFileSync(resultsFile, JSON.stringify(results, null, 2));
}

// fal models run several at once; OpenAI models one at a time (5 images/minute account limit).
const jobs = (model: Model) => styles.flatMap((style) => scenes.map((scene) => () => one(model, style, scene)));
async function pool(tasks: (() => Promise<void>)[], size: number) {
  const queue = [...tasks];
  await Promise.all(Array.from({ length: size }, async () => { for (let task = queue.shift(); task; task = queue.shift()) await task(); }));
}
await Promise.all(models.map((model) => pool(jobs(model), model.id.startsWith("gpt") ? 1 : 3)));

// Contact sheet: one table per style, scenes down, models across.
const cell = (model: string, style: string, scene: number) => {
  const r = results.find((x) => x.model === model && x.style === style && x.scene === scene);
  return r?.ok ? `<td><img src="${r.file}" loading="lazy"></td>` : `<td class="err">${r?.error ?? "—"}</td>`;
};
const html = `<!doctype html><meta charset="utf-8"><title>Comic.me benchmark ${run}</title>
<style>body{font:13px system-ui;margin:16px}table{border-collapse:collapse;margin-bottom:32px}td,th{border:1px solid #ccc;padding:4px;vertical-align:top}img{width:230px;display:block}.err{width:230px;color:#b91c1c}</style>
${styles.map((style) => `<h2>${style.label}</h2><table><tr><th>Scene</th>${models.map((m) => `<th>${m.label}</th>`).join("")}</tr>${scenes.map((scene) => `<tr><th>${scene.id}. ${scene.title}</th>${models.map((m) => cell(m.id, style.id, scene.id)).join("")}</tr>`).join("")}</table>`).join("")}`;
writeFileSync(path.join(outDir, "index.html"), html);

const summary = models.map((m) => {
  const mine = results.filter((r) => r.model === m.id);
  const ok = mine.filter((r) => r.ok);
  return `${m.label.padEnd(24)} ${ok.length}/${mine.length} ok · avg ${(ok.reduce((s, r) => s + r.seconds, 0) / Math.max(1, ok.length)).toFixed(0)}s · ~$${ok.reduce((s, r) => s + r.usd, 0).toFixed(2)}`;
});
console.log(`\n${summary.join("\n")}\n\nContact sheet: ${path.join(outDir, "index.html")}`);
