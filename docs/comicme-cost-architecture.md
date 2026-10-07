# Cost-first architecture

> Comic.me's advantage: **expensive generation only happens after the person has approved the comic's structure.**

## Cost stages (measured or estimated per comic, ~10 pages / ~35 panels)

| Stage | What runs | Cost | Gate |
|---|---|---|---|
| Interview | Transcription + Claude turns + text-to-speech | ~$0.10–0.40 | — |
| Story write-up | Claude | ~$0.05–0.10 | User locks story |
| Character Bible | Claude (cast planner) | ~$0.02 (measured) | — |
| Photo checks | Claude vision | ~$0.01–0.02 each | — |
| Character designs | 1 image per approved look (+ revisions) | ~$0.05–0.08 each; typically 2–6 looks | **User approves each look** |
| Comic Director + editor + cover art director | Claude | ~$0.50–0.80 | — |
| Storyboard | Rendered in the browser | **$0** | **User approves storyboard** ← main money gate |
| Cover + panels | ~36 images | ~$2.00–2.60 (medium quality) | — |
| Redraws | 1 image each | ~$0.06 each | User asks |
| Lettering edits | Browser | **$0** | — |

**Typical total: about $3–4.50 per finished comic** (≈ ₹250–380). The art is about 65% of it, and it only happens after approval.

## What the new workflow saves
- **Storyboard before art:** every change to dialogue, page count, panel count, order, ages or wardrobe is free. Before the storyboard existed, fixing a pacing problem meant redrawing up to 40 images.
- **Choosing a cover idea from text:** picking from 3 ideas costs $0 instead of drawing 3 covers (~$0.20).
- **Lettering in code:** dialogue fixes never cost a redraw.
- **Single-panel redraws** instead of regenerating the comic.
- **Character approval up front:** stops whole-comic redraws caused by a wrong face.

## Measurement (implemented)
Every call logs provider, model, operation, tokens (Claude) or size/quality/references (images), retries and $ (`src/lib/meter.ts`). Run `node scripts/cost-report.ts --detail` for a per-comic breakdown.

**Still to attach:** interview costs (they happen before a comic exists) and storage/bandwidth costs.

## Contribution margin (to fill in after a real run)
```
price per comic (e.g. ₹699 for ~10 pages)
− AI cost (measured, ~₹250–380)
− payment fees (~2–3%)
− storage/bandwidth (~₹2–5)
= contribution margin
```

## Levers if margins are tight (in order)
1. **Cheaper capable models** for panels: Seedream 5 Lite (~$0.03), or GPT Image 2.5 Flare at medium. Benchmark quality first.
2. **Lower quality for small panels**, high quality only for splashes and covers. The quality setting can vary per panel by size.
3. **Fewer panels per page** in sparse styles (Ink).
4. **Prompt caching** for the long Comic Director system prompt (Claude).
5. **Batch API** for non-urgent Claude passes (50% off) if waiting isn't a problem.
6. Self-hosted FLUX.2 [dev] at scale.
