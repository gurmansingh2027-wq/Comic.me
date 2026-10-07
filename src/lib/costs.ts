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
