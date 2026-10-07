import type { Comic, CostEntry, CostItem } from "./comic";

// Rough API prices (USD, October 2026) used for estimates shown to the user and for the
// per-comic cost log. Update these when prices or models change.

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

/** Records a paid call on a comic object that is about to be saved. */
export function addCost(comic: Comic, item: CostItem, detail?: string): void {
  comic.costLog = [...(comic.costLog ?? []), { item, usd: PRICE_FOR[item], at: new Date().toISOString(), detail }];
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
