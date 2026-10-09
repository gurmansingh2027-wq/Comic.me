import type { Comic, ComicScript, CostEntry, CostItem, CostUsage } from "./comic";

// Rough API prices (USD, October 2026) used for estimates shown to the user and for the
// per-comic cost log. Update these when prices or models change.

/** Claude price per million tokens, by model (input, output). Cache reads/writes are not split out. */
export const CLAUDE_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function claudeCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = CLAUDE_PER_MILLION[model] ?? CLAUDE_PER_MILLION["claude-opus-5-5"];
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/**
 * OpenAI image models bill tokens (USD per million). GPT Image 2 and 2.5 share this rate card;
 * 2.5 just uses far fewer output tokens per picture at the same quality.
 */
export const IMAGE_TOKEN_PRICES = { textInput: 5, imageInput: 8, imageOutput: 30 };

/** Published output tokens for a 1024×1024 picture, by model and quality (Oct 2026). */
const OUTPUT_TOKENS: Record<string, Record<string, number>> = {
  "gpt-image-2": { low: 196, medium: 1756, high: 7024 },
  "gpt-image-2.5": { low: 196, medium: 439, high: 1756 },
};
/** Measured: one 1536×1024 design sheet sent as a reference ≈ 1,536 image input tokens. */
const TOKENS_PER_REFERENCE = 1536;
/** Our panel and design prompts run to roughly 1,000 text tokens. */
const PROMPT_TOKENS = 1000;

function outputTokens(model: string, quality: string): number {
  const table = model.startsWith("gpt-image-2.5") ? OUTPUT_TOKENS["gpt-image-2.5"] : OUTPUT_TOKENS["gpt-image-2"];
  return table[quality] ?? table.medium;
}

/** Token usage as OpenAI reports it on an image response. */
export type ImageTokens = { textInput: number; imageInput: number; output: number };

export function imageTokenCost(tokens: ImageTokens): number {
  return (
    tokens.textInput * IMAGE_TOKEN_PRICES.textInput +
    tokens.imageInput * IMAGE_TOKEN_PRICES.imageInput +
    tokens.output * IMAGE_TOKEN_PRICES.imageOutput
  ) / 1_000_000;
}

/** Up-front estimate for one picture (used before drawing, and when OpenAI reports no usage). */
export function imageCost(model: string, size: string, quality: string, references: number): number {
  const [w, h] = size.split("x").map(Number);
  const megapixels = w && h ? (w * h) / (1024 * 1024) : 1;
  return imageTokenCost({
    textInput: PROMPT_TOKENS,
    imageInput: references * TOKENS_PER_REFERENCE,
    output: Math.round(outputTokens(model, quality) * megapixels),
  });
}

/** What the browser needs to estimate drawing costs on the storyboard. */
export type PicturePricing = { base: number; perReference: number; /** Extra for a hero panel (higher quality, bigger). */ heroExtra: number };

export function picturePricing(model: string, quality: string, heroQuality = quality): PicturePricing {
  const base = imageCost(model, "1024x1024", quality, 0);
  const hero = imageCost(model, "1296x1296", heroQuality, 0);
  return { base, perReference: imageCost(model, "1024x1024", quality, 1) - base, heroExtra: Math.max(0, hero - base) };
}

// Voice interview (OpenAI): transcription is billed per minute of audio, speech per minute spoken.
export const VOICE_PRICES = { transcribePerMinute: 0.0045, speechPerMinute: 0.015 };
/** Typical speaking pace, to estimate audio length from text. */
const WORDS_PER_MINUTE = 150;

export function speechCost(text: string): number {
  return (text.split(/\s+/).filter(Boolean).length / WORDS_PER_MINUTE) * VOICE_PRICES.speechPerMinute;
}

export function transcriptionCost(seconds: number): number {
  return (seconds / 60) * VOICE_PRICES.transcribePerMinute;
}

export const PRICES = {
  /** Fallbacks for old log entries without measured usage: one medium gpt-image-2 picture with references. */
  picture: 0.07,
  /** One character design sheet (1536×1024, from photos or a description). */
  characterDesign: 0.08,
  /** Claude writing + editing one comic script. */
  script: 0.5,
  /** Claude: cast list, photo checks, design descriptions, interview turns (small calls). */
  smallClaudeCall: 0.02,
} as const;

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Cost to draw a comic: every panel (with one reference per drawn person, up to 4) plus the
 * cover (with the main cast).
 */
export function drawingCost(script: ComicScript, pricing: PicturePricing): number {
  const picture = (people: number) => pricing.base + Math.min(people, 4) * pricing.perReference;
  const panels = script.pages.flatMap((page) => page.panels);
  const cover = script.cover ? picture(script.characters.length) : 0;
  return cover + panels.reduce((sum, panel) => sum + picture(panel.context?.cast.length ?? 1) + (panel.hero ? pricing.heroExtra ?? 0 : 0), 0);
}

const PRICE_FOR: Record<CostItem, number> = {
  cast: PRICES.smallClaudeCall,
  "photo-check": PRICES.smallClaudeCall,
  "character-design": PRICES.characterDesign,
  "design-description": PRICES.smallClaudeCall,
  script: PRICES.script,
  picture: PRICES.picture,
  redraw: PRICES.picture,
  interview: PRICES.smallClaudeCall,
};

/**
 * Records a paid call on a comic object that is about to be saved. With measured usage (see
 * src/lib/meter.ts) the real cost is logged; otherwise a list-price estimate.
 */
export function addCost(comic: Comic, item: CostItem, detail?: string, usage?: CostUsage[]): void {
  const measured = usage && usage.length > 0 ? usage.reduce((sum, entry) => sum + entry.usd, 0) : undefined;
  const entry: CostEntry = { item, usd: measured ?? PRICE_FOR[item], at: new Date().toISOString(), detail, usage };
  comic.costLog = [...(comic.costLog ?? []), entry];
}

export function totalCost(log: CostEntry[] = []): number {
  return log.reduce((sum, entry) => sum + entry.usd, 0);
}

/** Counts and totals per kind of call, e.g. for "38 pictures · $2.66". */
export function costBreakdown(log: CostEntry[] = []): { item: CostItem; count: number; usd: number }[] {
  const groups = new Map<CostItem, { count: number; usd: number }>();
  for (const entry of log) {
    const group = groups.get(entry.item) ?? { count: 0, usd: 0 };
    groups.set(entry.item, { count: group.count + 1, usd: group.usd + entry.usd });
  }
  return [...groups.entries()].map(([item, group]) => ({ item, ...group }));
}
