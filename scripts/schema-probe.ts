// Checks that every Claude structured-output schema still compiles within Claude's grammar-size
// limit. Claude compiles each schema into a grammar; past an (undocumented) size the API rejects
// every call with "The compiled grammar is too large", which the app can't recover from. Run this
// after changing any schema passed to askClaude. Each probe is a one-token request: free when the
// schema is rejected, about a cent when it passes.
//
// Run: npm run probe-schemas   (needs ANTHROPIC_API_KEY, e.g. `set -a; source .env.local; set +a`)

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { EditSchema, ScriptSchema } from "../src/lib/engines/story";
import { PanelVerdictSchema, SequenceSchema } from "../src/lib/qa/visual-qa";

const schemas: Record<string, z.ZodType> = {
  "comic director (story.ts ScriptSchema)": ScriptSchema,
  "dialogue editor (story.ts EditSchema)": EditSchema,
  "visual QA panel verdict": PanelVerdictSchema,
  "visual QA sequence verdict": SequenceSchema,
};

async function main() {
  const client = new Anthropic({ maxRetries: 0 });
  let failed = 0;
  for (const [name, schema] of Object.entries(schemas)) {
    const started = Date.now();
    try {
      await client.beta.messages.create({ model: "claude-opus-5-5", max_tokens: 1, messages: [{ role: "user", content: "ok" }], output_config: { format: betaZodOutputFormat(schema) } });
      console.log(`✓ ${name} (${Date.now() - started} ms)`);
    } catch (error) {
      const message = (error as { error?: { error?: { message?: string } }; message: string }).error?.error?.message ?? (error as Error).message;
      console.log(`✗ ${name}: ${message}`);
      failed++;
    }
  }
  if (failed) { console.log(`\n${failed} schema(s) rejected: fold fields into existing ones or remove some before shipping.`); process.exit(1); }
  console.log("\nAll schemas compile.");
}
main();
