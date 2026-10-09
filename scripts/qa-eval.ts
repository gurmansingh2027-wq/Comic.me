// Runs the visual-QA evaluation against a labelled failure dataset and prints what it caught.
// Needs a dev server started with COMICME_DEV_TOOLS=1 (and the comic in its storage). Paid:
// about $0.02-0.04 per checked picture (Claude vision), nothing is drawn.
//
// Run: node scripts/qa-eval.ts [--base http://localhost:3000] [--only 7-3,4-6] [--effort high]

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = arg("base") ?? "http://localhost:3000";
const only = arg("only")?.split(",");
const effort = arg("effort") ?? "low";

const response = await fetch(`${base}/api/dev/qa-eval`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ only, effort }),
});
if (!response.ok) {
  console.error(response.status, await response.text());
  process.exit(1);
}
const report = await response.json();
for (const r of report.results) {
  const mark = r.caught ? "✓" : "✗";
  console.log(`${mark} ${r.key.padEnd(5)} expect [${r.expect.join(", ") || "clean"}] → found [${r.found.join(", ") || "none"}] ${r.decision} (${r.confidence}, $${r.usd.toFixed(3)}, ${r.seconds}s)`);
  for (const what of r.what) console.log(`      ${what}`);
}
console.log("\n", report.summary);
