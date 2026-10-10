# Roadmap

> Optimise for genuinely excellent comics, while keeping the build practical for a small team.

| Phase | Goal | Status |
|---|---|---|
| 0 | Story → 6-panel proof of concept | ✅ |
| 1 | Story → structured multi-page script; real layouts; lettering in code | ✅ |
| 2 | Character creation from photos/AI with approval | ✅ |
| 3 | Storyboard before art; editable everything; panel redraws | ✅ |
| 4 | Character Bible (identity, life stages, wardrobe); scene context; Comic Director; style recipes; cover ideas; measured costs | ✅ (PR #3) |
| 5 | **Image-model benchmark** (OpenAI 2 vs 2.5 vs Nano Banana 2 vs Seedream 5 vs FLUX.2) + provider adapter | Next: needs `FAL_KEY` + OpenAI credit |
| 6 | **Automatic quality checks** (vision check per panel, one auto-redraw, cost cap) | Next |
| 7 | Explore + Recreate (opt-in publishing, remix presets) | Prototype in progress |
| 8 | Style LoRAs for 1–2 signature styles (Ink, Chaos) | After the benchmark |
| 9 | Accounts, payments at the storyboard gate (Mini / Story / Epic), Supabase + R2, background job queue | Before public launch |
| 10 | Exports: CBZ, Instagram carousel, Reel; SFX lettering; turnaround and location sheets | After launch |
| 11 | Cost optimisation and self-hosting (FLUX.2 [dev] + LoRA, PuLID, ControlNet) | When volume justifies it |

## Biggest technical risks
1. **Identity drift** in hard shots (back views, crowds, 4+ people). Mitigation: QA loop, turnaround sheets, a better model after the benchmark.
2. **Rate limits** (OpenAI allows 5 images/min on new accounts). Mitigation: higher usage tiers, a second provider, queueing.
3. **Long jobs on serverless** (5–10 minutes). Mitigation: a background job queue before launch.
4. **Real-people photos** (privacy, consent, misuse). Mitigation: consent copy, private storage, no Explore exposure.
5. **Style IP:** prompts and LoRAs must never imitate specific living artists or copyrighted characters.

## Recommended MVP for launch
Voice story → 4 signature styles → characters from photos → storyboard approval + payment → art with automatic quality checks → editable comic → PDF. Ship with **one** image provider chosen by the benchmark, and keep the adapter so we can switch.
