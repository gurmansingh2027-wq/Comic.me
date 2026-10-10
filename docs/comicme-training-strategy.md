# Training proprietary Comic.me styles (LoRA)

> Only after the benchmark shows that prompt-only styles aren't enough. LoRAs only work with open models (FLUX.2 [dev], Qwen-Image), not with OpenAI or Google.

## When a LoRA is worth it
- A style that prompting can't hold consistently across 40 panels (likely Ink and Chaos).
- A signature house look that competitors can't copy by prompting.

## Recipe (no GPU needed: fal.ai hosted trainers)
1. **Collect 20–50 images in ONE consistent style**, with rights to use them: commissioned from an illustrator (best), our own approved generations (bootstrapping), or CC-BY sources like Pepper & Carrot (with attribution). **Never scraped commercial comics.**
2. **Cut full pages into panels** where needed. Magi (panel detector) can help; check its terms first, or crop by hand.
3. **Curate.** Remove near-duplicates and weak images, and mix shot types (close-ups, wides, action, quiet).
4. **Caption** each image with JoyCaption (Apache-2.0) and add a trigger word, e.g. `cmeINK`. Describe content, not style: the LoRA should learn the style itself.
5. **Train** on fal.ai:
   - FLUX.2 [dev] trainer: about $6.40 per 1,000 steps
   - or the Qwen-Image trainer: about $2 per 1,000 steps (good for anime/manga)
   - start at ~1,000 steps
6. **Plug it into the style recipe:** `lora: { url, trigger: "cmeINK", scale: 0.8–1.0 }`.
7. **Benchmark** with the 40 scenes against prompt-only. Ship only if it wins on style consistency without losing identity.

## Metadata worth tagging in a style dataset
style · medium · shot type · camera angle · number of characters · pose · emotion · location · lighting · action · palette · line weight · background complexity.

**Panels vs pages:** train style LoRAs on **panels** (cleaner composition signal). Full pages are only useful for learning page layout, which we handle in code.

## Tools if we ever train ourselves
ostris/ai-toolkit (MIT, easiest UI) · kohya sd-scripts (Apache-2.0). Treat SimpleTuner and OneTrainer (AGPL) as separate tools, not code to embed.
