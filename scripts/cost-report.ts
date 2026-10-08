// Prints what every saved comic cost in AI fees, to help set pricing tiers.
// Run: node scripts/cost-report.ts            (one line per comic)
//      node scripts/cost-report.ts --detail   (every measured AI call: provider, model, tokens, image size)

import { readdirSync, readFileSync } from "node:fs";
import { costBreakdown, formatUsd, totalCost } from "../src/lib/costs.ts";

const root = "storage/comics";
const rows = readdirSync(root)
  .map((id) => {
    try {
      return JSON.parse(readFileSync(`${root}/${id}/comic.json`, "utf8"));
    } catch {
      return null;
    }
  })
  .filter((comic) => comic?.costLog?.length);

if (rows.length === 0) {
  console.log("No comics with a cost log yet (comics made before the log existed aren't counted).");
}
for (const comic of rows) {
  const pages = comic.script?.pages?.length ?? 0;
  const breakdown = costBreakdown(comic.costLog)
    .map((row) => `${row.item} ×${row.count}`)
    .join(", ");
  console.log(`${formatUsd(totalCost(comic.costLog)).padStart(7)}  ${String(comic.script?.title ?? "(not written yet)").padEnd(32)} ${pages} pages  ${breakdown}`);
  // Measured calls: provider, model, operation, tokens / image size, retries.
  const calls = comic.costLog.flatMap((entry: { usage?: unknown[] }) => entry.usage ?? []);
  if (calls.length > 0 && process.argv.includes("--detail")) {
    for (const call of calls) {
      const tokens = call.inputTokens !== undefined ? ` ${call.inputTokens} in / ${call.outputTokens} out tokens` : "";
      const size = call.image
        ? `${call.image.size} ${call.image.quality} +${call.image.references} refs${tokens}`
        : call.audioSeconds !== undefined
          ? `${call.audioSeconds}s audio`
          : tokens.trim();
      const estimate = call.measured === false ? "  (estimate)" : "";
      console.log(`         $${call.usd.toFixed(4).padStart(6)}  ${call.provider}/${call.model}  ${call.operation}  ${size}${call.retries ? `  (${call.retries} retries)` : ""}${estimate}`);
    }
  }
}
if (rows.length > 1) {
  const average = rows.reduce((sum, comic) => sum + totalCost(comic.costLog), 0) / rows.length;
  console.log(`\nAverage per comic: ${formatUsd(average)} across ${rows.length} comics`);
}
