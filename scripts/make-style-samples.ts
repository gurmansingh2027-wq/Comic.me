// Draws one sample picture per comic style (the same scene in every style) for the style picker.
// Run: node scripts/make-style-samples.ts            (only styles missing a sample)
//      node scripts/make-style-samples.ts --force    (redraw all)
//      node scripts/make-style-samples.ts noir manga (just these)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import { COMIC_STYLES } from "../src/lib/styles.ts";

const SCENE =
  "A grandmother and her teenage granddaughter laughing together while rolling out dough at a kitchen table in warm afternoon light. Flour in the air, a window with potted herbs behind them, a cat watching from a chair.";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);
const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((arg) => !arg.startsWith("--"));
const styles = COMIC_STYLES.filter(
  (style) => (only.length === 0 || only.includes(style.id)) && (force || !existsSync(`public/styles/${style.id}.webp`)),
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One at a time, waiting whenever OpenAI's images-per-minute limit is reached.
for (const style of styles) {
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await client.images.generate({
        model: env.OPENAI_IMAGE_MODEL || "gpt-image-2",
        prompt: `A single comic book panel illustration, square.\n\nArt style: ${style.art}\n\nScene: ${SCENE}\n\nIMPORTANT: Do not draw any text, letters, speech balloons, logos or watermarks.`,
        size: "1024x1024",
        quality: "medium",
        output_format: "webp",
        output_compression: 80,
      });
      writeFileSync(`public/styles/${style.id}.webp`, Buffer.from(result.data![0].b64_json!, "base64"));
      console.log(`✓ ${style.label}`);
      break;
    } catch (error) {
      if (!(error instanceof OpenAI.RateLimitError) || attempt >= 8) throw error;
      console.log(`  waiting for the rate limit (${style.label})…`);
      await sleep(20_000);
    }
  }
}
