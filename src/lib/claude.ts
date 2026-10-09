import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { claudeCost } from "./costs";
import { requireEnv, UserFacingError } from "./errors";
import { auditBudgetActive, reserveAuditCost, settleAuditCost } from "./qa/budget";
import { recordUsage } from "./meter";

const MODEL = "claude-opus-5-5";

/** An image block for Claude, from a JPEG/WebP file's bytes. */
export function imageBlock(data: Buffer, mediaType: "image/jpeg" | "image/webp") {
  return { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: data.toString("base64") } };
}

/** Asks Claude for a structured (schema-checked) answer. */
export async function askClaude<S extends z.ZodType>({
  system,
  user,
  schema,
  effort,
  maxTokens = 64000,
  operation = "claude",
  repair,
}: {
  system: string;
  /** Text, or content blocks (e.g. images followed by text). */
  user: BetaMessageParam["content"];
  schema: S;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
  /** What this call is for, for the cost log (e.g. "comic-director"). */
  operation?: string;
  /** Last resort when the answer doesn't match the schema: fix the raw JSON (e.g. map an unknown enum value). */
  repair?: (raw: unknown) => unknown;
}): Promise<z.infer<S>> {
  const budgeted = auditBudgetActive();
  const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY"), ...(budgeted ? { maxRetries: 0 } : {}), timeout: 180_000 });
  const input = { model: MODEL, system, messages: [{ role: "user" as const, content: user }] };
  const reservation = budgeted ? await reserveAuditCost((await client.beta.messages.countTokens(input)).input_tokens, maxTokens) : 0;
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    // If Claude's safety filters decline, the API retries on a fallback model automatically.
    ...(budgeted ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
    // The schema is enforced by Claude; we parse the answer ourselves so a mismatch can be logged and repaired.
    output_config: { effort, format: { type: "json_schema", schema: betaZodOutputFormat(schema).schema } },
    system,
    messages: [{ role: "user", content: user }],
  });
  const response = await stream.finalMessage();
  const inputTokens =
    response.usage.input_tokens + (response.usage.cache_creation_input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0);
  await settleAuditCost(reservation, claudeCost(response.model, inputTokens, response.usage.output_tokens));
  recordUsage({
    provider: "anthropic",
    model: response.model,
    operation,
    inputTokens,
    outputTokens: response.usage.output_tokens,
    usd: claudeCost(response.model, inputTokens, response.usage.output_tokens),
    measured: true,
  });

  if (response.stop_reason === "refusal") {
    throw new UserFacingError("Our AI couldn't help with this story. Try rewording it or leaving out sensitive details.");
  }
  const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("");
  if (response.stop_reason === "max_tokens" || !text.trim()) {
    throw new UserFacingError("The AI's answer came back incomplete. Please try again.", 502);
  }
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new UserFacingError("The AI's answer wasn't valid JSON. Please try again.", 502); }
  let parsed = schema.safeParse(raw);
  if (!parsed.success && repair) parsed = schema.safeParse(repair(raw));
  if (!parsed.success) {
    console.error(`${operation}: answer from ${response.model} didn't match the schema: ${parsed.error.message.slice(0, 600)}\nRaw: ${text.slice(0, 1500)}`);
    throw new UserFacingError("The AI's answer didn't match the expected format. Please try again.", 502);
  }
  return parsed.data as z.infer<S>;
}
