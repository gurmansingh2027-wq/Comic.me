# Image model benchmark — pilot results (8 Oct 2026)

**Question:** which image model should draw Comic.me panels?

## Setup

- **Test:** 5 models × 2 styles (Prestige, Ink) × 10 hard scenes = 100 pictures. Total cost about $7.30.
- **References:** every model got the same approved design sheets from comic `2e97680d…`, plus the style sample.
  - Gurman at his main age and at 8 and 17.
  - Kabir at his main age and at 8.
- **Run it again:** `node scripts/benchmark.ts --comic <id> --styles prestige,ink --run <name>`.
  - It needs `FAL_KEY` in `.env.local` for the fal.ai models.
  - Output goes to `benchmark/<run>/`, which is git-ignored. Open `index.html` there for the full contact sheet.

The ten scenes:

1. Close-up crying
2. Seen from behind, city at night
3. Two people arguing
4. Wedding hug
5. Two kids playing cricket (age 8)
6. Teen dunk, low angle
7. Two on a scooter in the monsoon
8. Then-and-now (8-year-old and adult together)
9. Hands on a laptop
10. A symbolic still life with no people

## Numbers

| Model | Provider | Drawn | Avg time | Cost / picture* |
| --- | --- | --- | --- | --- |
| GPT Image 2 (old default) | OpenAI | 20/20 | 46 s | ~$0.077 |
| **GPT Image 2.5 Flare** | OpenAI | 20/20 | **23 s** | ~$0.077 |
| Nano Banana 2 | fal.ai | 20/20 | 22 s | ~$0.080 |
| Seedream 5 Pro | fal.ai | 20/20 | 121 s | ~$0.074 |
| FLUX.2 Pro | fal.ai | 18/20 | 27 s | ~$0.066 |

\*Estimates from list prices at 1024×1024 medium quality with 3–4 references.

- GPT Image 2.5 uses the same official token rates as GPT Image 2.
- The usage OpenAI reported for a Flare test picture suggests the real cost may be lower. We should log OpenAI's reported tokens instead of estimates.

## What we saw (scored by eye, 1–5)

| | GPT Image 2 | 2.5 Flare | Nano Banana 2 | Seedream 5 Pro | FLUX.2 Pro |
| --- | --- | --- | --- | --- | --- |
| Same face / turban / beard as the design | 5 | 5 | 4 | 5 | 3 |
| Right age (kid vs adult scenes) | 5 | 5 | 4 | 5 | 3 |
| Two people in one picture | 5 | 5 | 4 | 5 | 4 |
| Prestige looks premium | 4 | 5 | 4 | 4 | 3 |
| Ink looks like real pen & ink | 4 | 4 | 5 | 5 | 3 |
| Camera / composition variety | 3 | 4 | 5 | 4 | 3 |
| No stray text / borders | 5 | 5 | 3 | 5 | 2 |
| Reliability | 5 | 5 | 5 | 5 | 4 |

### GPT Image 2.5 Flare
- Same faces and outfits as GPT Image 2, at half the time.
- Prestige pictures are a little richer, especially the light in the scooter and wedding scenes.
- It tends to crop tight. In scene 6 the dunk lost his legs.
- A wide 1776×592 panel also came out well, in 13 s.

### Nano Banana 2
- The most "comic-book" look, and the best camera variety: wide establishing shots and real depth.
- Ink comes out as true pen hatching.
- **Problems:**
  - Ink scene 8: adult Gurman lost his turban (an identity miss).
  - Ink scene 3: the navy polo became orange and red.
  - It often draws its own panel border, which clashes with our page layout.
  - Some props drifted. In scene 8 the tennis ball became a red cricket ball.

### Seedream 5 Pro
- Excellent likeness and the nicest ink texture.
- At about 2 minutes per picture, a 40-panel comic would take too long.
- Prestige scene 2 showed his profile instead of his back.

### FLUX.2 Pro
- **Refused 2 Ink scenes:** kids playing cricket, and hands on a laptop.
- Added white borders and a signature, and drew a beard on 8-year-old Gurman (prestige scene 5).
- Lost the turban in ink scenes 3 and 8.
- Cheapest, but not good enough for personal stories.

## Decision

1. **Default switched to `gpt-image-2.5-flare`.**
   - Same price and the same code path.
   - About 2× faster, so a 40-panel comic is drawn in roughly half the time.
   - Identity, ages and outfits are as good as before.
   - To go back, set `OPENAI_IMAGE_MODEL=gpt-image-2` in `.env.local`.
2. **Nano Banana 2 is the candidate for the Ink and Chaos signature styles.**
   - Before switching:
     - add a provider adapter so a style recipe can pick its model
     - stop it drawing borders
     - re-test identity with a stronger "keep the turban" instruction
3. **Seedream 5 Pro** is the quality backup if speed stops mattering, e.g. for the cover only.
4. **FLUX.2 Pro** is dropped for now.

## Next round

- Run the remaining styles: Chaos, Manga and one classic style.
- Use real panel shapes instead of squares, and 3+ characters in one panel.
- Re-test Nano Banana 2 with the border and identity fixes.
- Log OpenAI's reported token usage to get exact costs.
