# Image model benchmark plan

> Goal: pick image models with evidence, not opinion. Every model, LoRA or prompt change runs the same fixed scenes.

## Candidates (round 1)
| # | Model | Provider | Key needed |
|---|---|---|---|
| A | GPT Image 2 (current baseline) | OpenAI | existing `OPENAI_API_KEY` |
| B | GPT Image 2.5 Flare | OpenAI | existing key |
| C | Nano Banana 2 | fal.ai | `FAL_KEY` |
| D | Seedream 5.0 (Pro edit) | fal.ai | `FAL_KEY` |
| E | FLUX.2 [pro] (multi-reference) | fal.ai | `FAL_KEY` |
| F (round 2) | FLUX.2 [dev] + Comic.me style LoRA | fal.ai | `FAL_KEY` (+ ~$6 training) |

## Fixed cast and styles
- Cast: two main characters with approved sheets (one from a real photo, one AI-designed), one child stage, one elderly side character.
- Styles: Prestige, Chaos, Ink, Manga.

## 40 scenes (each run in all 4 styles = 160 images per model)
1. one character, close-up, neutral
2. one character, extreme close-up, crying
3. one character from behind, looking at a city
4. one character, low-angle hero shot
5. one character running through an airport, motion
6. one character sitting at a desk, night, lamp light
7. two characters talking face-to-face, medium shot
8. two characters hugging
9. two characters arguing, one shouting
10. two characters on a scooter (vehicle)
11. two characters in monsoon rain, umbrellas
12. two characters at a wedding, festive clothes
13. two characters playing basketball (action)
14. two characters as kids (child stage) playing cricket in a lane
15. the same character as a child and an adult in one image (then and now)
16. three characters at a dinner table, wide shot
17. three characters in a crowd at a festival, night
18. three characters in a business meeting, workwear
19. four characters group photo pose (stress test)
20. elderly character laughing at a party
21. character in a school uniform (wardrobe change)
22. character in sportswear
23. character in winter layers, snow
24. character at the beach, beachwear
25. character in a hospital bed (emotional)
26. overhead shot of two characters lying on grass
27. Dutch-angle tense confrontation
28. silhouette against a sunset
29. character holding a specific prop (taped tennis ball)
30. character typing on a laptop, close on hands
31. establishing shot of a busy Indian street, tiny figures
32. interior of a small kitchen at dawn, one character
33. fight / physical comedy fall
34. absurd moment (sentient suitcase): tests Chaos
35. quiet symbolic image (empty chair): tests Ink
36. reaction close-up with speed lines: tests Manga
37. splash: character triumphant on a rooftop
38. cover: symbolic object, no people
39. cover: hero composition with title space at the top
40. redraw test: scene 7 again with "make her angrier, low angle"

## Scoring (1–5 each; two blind raters + a Claude vision pre-score)
Art quality · character identity (vs sheet) · multi-character correctness · style consistency (vs style sample) · composition/prompt accuracy · anatomy (hands, faces) · background quality · age/wardrobe correctness · story continuity (scene pairs) · no-text compliance.
Also record: cost per image (measured), latency, failure and retry rate, rate-limit issues.

## Cost of round 1
About 160 images × 5 models ≈ 800 images. At $0.03–0.10 each, that's **~$40–70**.

To keep it cheap, start with a **pilot of 10 scenes × 2 styles × 5 models = 100 images (~$6–8)**, then run the full set only on the top 2–3 models.

## How we'll run it
`scripts/benchmark.ts` (to build):
1. Reads the scenes.
2. Builds jobs with the real prompt builder.
3. Calls each provider.
4. Saves to `benchmark/<run>/<model>/<style>/<scene>.webp`.
5. Writes `results.csv` with cost and latency.

A simple contact sheet (an HTML page) lets us compare models side by side.
