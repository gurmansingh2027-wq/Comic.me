# Comic.me architecture

> "Give Comic.me your story and it turns your life, memory or idea into something you cannot believe was made for you."
> Principle: **spend almost nothing until the person approves exactly what they want.**

## The flow (as built)

```
STORY (voice interview, Claude)                    cheap
  → STYLE (style recipe)                           free
  → CHARACTERS (Character Bible + design sheets)   small (~$0.05–0.08 per approved look)
  → COMIC DIRECTOR (script + scene context)        cheap (~$0.5–0.8 Claude)
  → STORYBOARD (stick figures, editable)           free
      edit dialogue, panels, pages, layouts, ages, wardrobe, bubbles
      pick 1 of 3 cover ideas
  ✋ APPROVE STORYBOARD
  → ART (cover + every panel)                       expensive (~$2–3)
  → FINISHED COMIC (lettering in code)              free
  → TARGETED FIXES (redraw one panel, edit text)    small per redraw / free
```

**Why style comes before characters and storyboard:** style changes how the story is *directed* (a Chaos storyboard is a different storyboard from an Ink one), and character sheets are drawn in the style. Choosing style later would mean redoing both.

## Layers (engines)

| Layer | Job | Where |
|---|---|---|
| Interview | Voice/text → a written, locked story | `src/lib/engines/interview.ts`, `voice.ts` |
| Character Engine | Story → Character Bible (identity, life stages, wardrobe); photos → checked; design sheets → approved | `src/lib/engines/characters.ts`, `src/lib/cast-service.ts` |
| Style Engine | Style recipes: render + direction + cover + avoid + lettering + optional LoRA | `src/lib/styles.ts` |
| Comic Director | Story bible, style interpretation, page plan, panels with **scene context**, editor pass | `src/lib/engines/story.ts` |
| Cover Art Director | Genre → 3 distinct cover ideas with title typography | `src/lib/engines/cover.ts` |
| Art Engine | Builds image prompts from structured scene data; picks references per life stage; one swappable `drawImage` | `src/lib/engines/art.ts` |
| Render Engine | Pages, stick-figure storyboard, lettering (balloons, captions), PDF/PNG | `src/lib/engines/render.ts` |
| Cost Meter | Measures every call (provider, model, tokens/size, retries) and logs it on the comic | `src/lib/meter.ts`, `src/lib/costs.ts` |
| Storage | Local JSON + files today; swappable for Supabase + R2 | `src/lib/storage.ts` |

## API-first today, internalise later

| Stage | Inference | When to move |
|---|---|---|
| **Now** | OpenAI images (GPT Image 2 / 2.5), Claude for all language work | — |
| **Next** | Add **fal.ai** behind the same `drawImage` interface: Nano Banana 2, Seedream 5, FLUX.2 [dev] + LoRA | After the benchmark shows a win in consistency, cost or style |
| **Later** | Self-host FLUX.2 [dev] / Qwen + LoRAs + PuLID/ControlNet on rented GPUs (Modal, RunPod) | When volume makes per-image API margins worse than GPU rental, or when we need pose control |

## Production infrastructure (when we leave the laptop)
- **App:** Next.js on Vercel.
- **Database and auth:** Supabase (Postgres + Auth). The comic JSON maps cleanly to tables (see `comicme-data-model.md`).
- **Files:** Cloudflare R2 (photos private, art public via signed URLs).
- **Background jobs:** writing and drawing run 3–10 minutes, so use a queue (Inngest, Trigger.dev or Supabase queues) instead of in-request `after()`.
- **Payments:** Razorpay / Stripe at the storyboard-approval gate.
- **Analytics:** PostHog.
- **GitHub Student Pack:** check for credits on DigitalOcean/Azure (GPU hosting later), plus free tiers on Sentry, Doppler (secrets) and Heroku.

## What we build vs buy
- **Build (our moat):** the Comic Director, Character Bible and scene context, style recipes, storyboard UX, lettering/renderer, cost discipline, Explore/Recreate.
- **Buy/API:** image models, voice, LLMs, hosting, payments.
- **Postpone:** self-hosted GPUs, per-character LoRAs, ControlNet pose rigs, social features (follows, comments, likes).
