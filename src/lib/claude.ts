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
}: {
  system: string;
  /** Text, or content blocks (e.g. images followed by text). */
  user: BetaMessageParam["content"];
  schema: S;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
  /** What this call is for, for the cost log (e.g. "comic-director"). */
  operation?: string;
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
    output_config: { effort, format: betaZodOutputFormat(schema) },
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
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new UserFacingError("The AI's answer came back incomplete. Please try again.", 502);
  }
  return response.parsed_output as z.infer<S>;
}
