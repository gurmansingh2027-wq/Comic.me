# Generation pipeline: one panel, end to end

## Today (implemented)
```
Scene context (Comic Director, edited on storyboard)
 + Character Bible (identity, life stage sheet, wardrobe)
 + Style recipe (render text, avoid list, sample picture for designs)
 + Shot & panel shape (from the page layout)
 + Neighbouring panels (continuity notes)
 + Speaker placement (from balloon sides)
 + "No text", leave room for lettering
        ↓
Prompt builder (src/lib/engines/art.ts: panelJob / contextFor)
        ↓
drawImage(job) → OpenAI images.edit (with references) or images.generate
   · paced for the provider's per-minute limit, retries on rate limits
   · measured by the cost meter
        ↓
Saved panel → lettered in the browser (balloons, captions) → PDF
        ↓
Optional: user redraw with feedback → same job + current picture as reference
```

### References sent per panel
1. When redrawing: the current panel.
2. Up to 4 character sheets, main characters first: **the sheet for the life stage in this scene**, with the instruction "copy who they are, not the outfit".

## Provider adapter (next)
One interface, many providers:
```ts
interface ImageProvider {
  id: "openai" | "fal";
  draw(job: { prompt; negative?; size; references: { path; role }[]; lora?: { url; trigger; scale } }): Promise<Buffer>;
  price(job): number;
}
```
The provider is chosen per style recipe, with a global default. Example: Prestige → `fal:nano-banana-2`; a trained "Comic.me Ink" → `fal:flux-2-dev + lora`.

## Quality check loop (next, highest-value addition)
After each panel:
1. **Vision check** (Claude, about $0.01): compare the panel with the sheets and the scene context. Are the right people present, the right number, the right age, the right clothes, the style held, no text in the image, hands and faces intact?
2. **Score** each item 0–2 → pass / soft-fail / hard-fail.
3. **Hard fail** → one automatic redraw with the specific correction ("Kabir is missing; the boy should be 8, not adult"). This is logged as a retry cost.
4. **Still failing** → show the panel with a gentle "Want us to redraw this?" chip instead of silently retrying (cost cap).

Expected cost: about +$0.01 per panel for checks, plus redraws on about 10–20% of panels. Benchmark first.

## Where structure beats prompting next
- **SFX** as a field per panel, lettered in code per style.
- **Turnaround sheets** (front, side, back) for main characters if back views drift.
- **Location sheets** for recurring places (the gali, the office), drawn once and passed as a reference.
- **Pose control** (ControlNet-type) only after self-hosting, or when an API exposes it.
