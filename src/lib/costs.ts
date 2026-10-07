import type { Comic, CostEntry, CostItem, CostUsage } from "./comic";

// Rough API prices (USD, October 2026) used for estimates shown to the user and for the
// per-comic cost log. Update these when prices or models change.

/** Claude price per million tokens, by model (input, output). Cache reads/writes are not split out. */
export const CLAUDE_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** gpt-image-2 price for one ~1 megapixel output picture, by quality. */
export const IMAGE_PER_MEGAPIXEL: Record<string, number> = { low: 0.006, medium: 0.053, high: 0.211 };
/** Rough extra cost for each reference picture sent with an image edit (input image tokens). */
export const IMAGE_REFERENCE = 0.01;

export function claudeCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = CLAUDE_PER_MILLION[model] ?? CLAUDE_PER_MILLION["claude-opus-5-5"];
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export function imageCost(size: string, quality: string, references: number): number {
  const [w, h] = size.split("x").map(Number);
  const megapixels = w && h ? (w * h) / (1024 * 1024) : 1;
  return megapixels * (IMAGE_PER_MEGAPIXEL[quality] ?? IMAGE_PER_MEGAPIXEL.medium) + references * IMAGE_REFERENCE;
}

export const PRICES = {
  /** One medium-quality ~1 megapixel gpt-image-2 picture, including character reference pictures. */
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

/** Cost to draw a comic: the cover plus every panel. */
export function drawingCost(panels: number, hasCover: boolean): number {
  return (panels + (hasCover ? 1 : 0)) * PRICES.picture;
}

const PRICE_FOR: Record<CostItem, number> = {
  cast: PRICES.smallClaudeCall,
  "photo-check": PRICES.smallClaudeCall,
  "character-design": PRICES.characterDesign,
  "design-description": PRICES.smallClaudeCall,
  script: PRICES.script,
  picture: PRICES.picture,
  redraw: PRICES.picture,
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
