# Image model landscape for Comic.me (October 2026)

> Research snapshot. Prices and rankings move monthly; re-check before committing. Sources are listed at the end.
> Nothing here has been benchmarked on Comic.me's own pipeline yet: see `docs/comicme-benchmark.md`.

## What Comic.me needs from an image model

In order of importance for a *personal* comic:

1. **Identity from references.** The same person, recognisably, across 30–40 panels, from a design sheet (and ideally from real photos), while their **clothes, age, pose and camera change**.
2. **Multiple characters at once.** 2–4 named people in one panel without swapping faces.
3. **Style fidelity.** Prestige, Chaos, Ink and Manga must look radically different, and stay consistent across a book.
4. **Composition control.** Shot type, camera angle, the speaker on the correct side, room left for balloons.
5. **Editing.** Redraw one panel with a requested change, keeping everything else.
6. **No text in images** (we letter in code), so text-rendering skill matters little.
7. **Trainable styles (LoRA)** for proprietary Comic.me looks.
8. Price, speed, API reliability, rate limits, commercial terms.

## The shortlist

| Model (provider) | References | Identity / multi-character | Style range | LoRA / training | Approx. price per ~1MP image* | Notes |
|---|---|---|---|---|---|---|
| **GPT Image 2** (OpenAI) *current* | many (edit endpoint) | Good; strong instruction-following | Wide | No | ~$0.03–0.05 medium (estimates vary) | What Comic.me uses today. Rate limit was 5 images/min on our account. |
| **GPT Image 2.5 Flare / Sunburst** (OpenAI, Sep 2026) | many | Better subject retention than 2, per OpenAI; up to 50% faster | Wide | No | Same token rates as GPT Image 2 | **Zero-effort upgrade to try: same key, one setting** (`OPENAI_IMAGE_MODEL`). Flare = fast default, Sunburst = precise edits. |
| **Nano Banana 2** (Google Gemini 3.1 Flash Image; on fal.ai or Google) | up to 14; "5-person consistency" | Widely reported as the best public API for recurring characters | Wide, strong on stylised | No | $0.08 (1K), ×1.5 2K, ×2 4K | Top-5 on Artificial Analysis image-editing arena. Reference images may add cost. |
| **Nano Banana Pro** (Gemini 3 Pro Image; fal.ai/Google) | up to 14 | Very strong; #2 on the editing arena | Wide | No | Higher than NB2 | Premium option for covers. |
| **Seedream 5.0 Pro / Lite** (ByteDance; fal.ai) | up to 10–14 | Good; strong multi-image fusion | Wide, illustration-friendly | No | ~$0.03 (Lite) / ~$0.07 (Pro edit) | Cheapest high-quality option; worth benchmarking for volume. |
| **FLUX.2 [pro] / [flex]** (Black Forest Labs; fal.ai, Replicate) | up to 10 (sources differ) | Good with clear role-per-reference | Strong photoreal & painterly | Pro: no | ~$0.03/MP out + $0.015/MP per input image | Very good texture/lighting. |
| **FLUX.2 [dev]** (open weights; fal.ai, Replicate) | yes | Good | Very wide **with LoRA** | **Yes**: fal trainer ≈ $6.40 per 1,000 steps | ~$0.012/MP | **The route to proprietary Comic.me styles** (style LoRA + references). |
| **Qwen-Image-Edit 2511** (Alibaba, open weights; fal.ai) | workflow-dependent | Improved character consistency in 2511 | Good stylised/anime | **Yes**: fal trainer ≈ $2 per 1,000 steps | low | Cheap to train; strong for Manga/anime; open licence. |
| Imagen 4 Ultra, Z-Image, Midjourney | text-only or no official API | Weak for references | — | — | — | Not suitable: no reference conditioning or no API. |

\* Indicative list prices from the sources below; real cost depends on size, quality and reference images. Comic.me logs measured costs per call (`src/lib/costs.ts`) and should be checked against provider dashboards.

### Leaderboards (blind human votes, Artificial Analysis, Oct 2026 snapshot)
- Text-to-image: GPT Image 2 (high) #1, then GPT Image 1.5, HiDream-O1, **Nano Banana 2**.
- Image editing: GPT Image 1.5 (high) #1, **Nano Banana Pro** #2, **Nano Banana 2** #3, grok-imagine, HunyuanImage 3.0.

Leaderboards test generic edits, not comic-specific character continuity. **Our own benchmark decides.**

## What this means for Comic.me

- **Keep OpenAI as the default now.** It works, it's integrated, and **GPT Image 2.5 Flare** is a free upgrade to test first (same key, same code).
- **Nano Banana 2 is the strongest challenger** for character consistency, especially with 3–4 people in a panel. Seedream 5 is the cost challenger.
- **For proprietary styles (LoRA), go to FLUX.2 [dev] or Qwen-Image on fal.ai.** Proprietary APIs (OpenAI, Google) can't be trained.
- **One provider account covers every challenger: fal.ai.** It hosts Nano Banana 2/Pro, Seedream 5, FLUX.2 (pro/dev + LoRA inference + trainer), and Qwen-Image-Edit (+ trainer). Replicate adds nothing we need that fal lacks (its well-known `ostris/flux-dev-lora-trainer` targets the older FLUX.1).
- **Likely end state:** a hybrid, with the provider chosen per job behind one `drawImage` interface.
  - Story panels: a reference-strong model (GPT Image 2.5 or Nano Banana 2).
  - Proprietary styles: FLUX.2 [dev] + LoRA, where a trained style beats prompting.
  - Covers: the best available "showpiece" model.

## Sources
- fal.ai FLUX.2 pricing: https://fal.ai/flux-2 · https://developer.puter.com/tutorials/flux-api-pricing/
- fal.ai Nano Banana 2 / image-editing APIs: https://fal.ai/learn/tools/best-image-to-image-apis-2026 · https://fal.ai/models/fal-ai/gemini-3-pro-image-preview/edit
- fal.ai Seedream 5.0 Pro vs Nano Banana 2: https://fal.ai/learn/devs/seedream-5-0-pro-vs-nano-banana-2
- fal.ai trainers: https://fal.ai/models/fal-ai/flux-2-trainer-v2 · https://fal.ai/models/fal-ai/qwen-image-trainer
- Replicate trainer: https://replicate.com/ostris/flux-dev-lora-trainer
- GPT Image 2.5 Flare/Sunburst: https://grida.co/docs/models/gpt-image-2.5 · https://datanorth.ai/news/openai-launches-chatgpt-images-2-5
- Comparisons: https://www.atlascloud.ai/blog/guides/best-ai-image-editing-models-2026 · https://linocut.ai/blogs/multi-reference-ai-image-models/
- Leaderboards: https://artificialanalysis.ai/text-to-image/arena/leaderboard-image · https://artificialanalysis.ai/text-to-image/arena/leaderboard-text
