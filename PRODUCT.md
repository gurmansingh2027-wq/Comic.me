# Comic.me — Product

> Shared source of truth for everyone (and every coding agent) working on this repo.

Turn a personal story, CV, couple journey or memory into a polished comic. The product should do most of the creative work for the user; it is not a complicated comic-making tool.

**V1 success test:** Can someone tell us a meaningful story, see themselves in the preview, and feel that the finished comic is worth paying for?

## Current status (v3 — building the new flow step by step)

New flow: **Your story (voice) → Style → Characters → Storyboard → Your comic.** Steps marked ✅ are built.

- ✅ **Your story — voice interview** (`/create`). Tap the mic and talk (or type). Claude (`src/lib/engines/interview.ts`) reacts and asks one follow-up question at a time (usually 4–7), read aloud by OpenAI text-to-speech (`gpt-4o-mini-tts`); answers are transcribed with `gpt-transcribe` (`src/lib/engines/voice.ts`). When it has enough (or the user says so) Claude writes the story up with a cast list; the user edits it and **locks** it. English only for now. Progress survives a page refresh.
- ✅ **Style** — four signature styles with radically different visual grammars (Prestige, Chaos, Ink, Manga) plus seven classic ones. Each is a **style recipe** in `src/lib/styles.ts`: how it's drawn (line, anatomy, colour, light, texture), how it directs the story (interpretation, camera, pacing, panel density), cover direction, an avoid-list and an optional LoRA slot. Style is chosen before characters and storyboard on purpose: it changes how the story is staged, and character designs are drawn in it.
- ✅ **Characters** (`/comic/<id>/characters`). Claude reads the locked story and lists the cast, marking each person main, supporting or minor (`src/lib/engines/characters.ts`). For each main/supporting character the user either uploads 1–4 photos or lets AI suggest a look. Claude checks the photos (good / needs another photo / unusable, with a friendly explanation). OpenAI draws a character design sheet (full body + portrait) in the chosen style, from the photos when given. The user approves it or asks for changes (up to 6 designs per character). On approval Claude writes a precise description of the design. Minor characters are drawn from their text description. Users can edit, add or remove characters. Business logic lives in `src/lib/cast-service.ts`.
  - **Character Bible:** identity (face, skin, hair, build, recognisable markers) is kept separate from clothes; typical wardrobe; the main age; and **life stages** only when the story spans years (e.g. 8 → 17 → 28 → 32). Each extra age gets its own design, drawn from the approved main look so it's clearly the same person, and must be approved too. Design sheets show who someone is; clothes change per scene.
- ✅ **Storyboard** (`/comic/<id>/storyboard`). After writing, the comic waits here; nothing is drawn (or paid for) until the user approves. Wireframe pages with code-drawn stick figures framed by camera shot. Edit title, tagline, cover idea, each panel's scene, caption and dialogue (speaker, balloon type, side); add/remove/reorder panels and pages; pick layouts. Captions and balloons can be dragged anywhere on the page and resized. Autosaves; shows estimated drawing time and cost (`src/components/StoryboardEditor.tsx`, `src/components/WireframePage.tsx`, `src/lib/script-edits.ts`).
- ✅ **Your comic** — as below. On the finished comic, captions and balloons can still be dragged, resized and edited (free: only lettering changes), and any single panel or the cover can be redrawn with a requested change.
- 🌍 **Explore + Recreate** (prototype): `/explore` is a visual wall of covers and big panels from comics their owners chose to share ("Share on Explore" on the finished comic; private by default; photos never shown). **Recreate** opens the builder with that comic's *format* (style, page count, layout pattern, pacing, cover approach and title lettering) as a preset; the story, names, dialogue and photos are never copied (`src/lib/explore.ts`, `remixPresetFor` in `src/lib/comic.ts`). No accounts or social features yet.
- ⏱ Countdown timers (with a safety buffer) on every slow step: finding the cast, photo checks, character designs, writing, each panel and the whole comic (`src/components/Countdown.tsx`).
- 💰 Cost log: every paid AI call is measured (provider, model, operation, tokens or image size/quality/references, retries) and logged on the comic with its real cost (`src/lib/meter.ts`, prices in `src/lib/costs.ts`); the comic page shows the total, and `node scripts/cost-report.ts --detail` prints every comic and call. The voice interview happens before a comic exists and isn't attached yet.

How the comic itself is made:

1. The locked story, the interview transcript and the approved cast go to the Story Engine. The writer must use the cast's exact names and looks.
2. **Story Engine** (Claude, `claude-opus-5-5`), in two passes, running in the background while the page shows progress:
   - *Comic Director:* story bible (logline, tone, arc, how each person talks) → interprets the story in the chosen style → chooses the length (typically 6–10 pages, max 12 pages / 40 panels) → plans each page with a real comic layout by narrative importance → writes each panel (shot, scene, caption, balloons) **with structured scene context**: who is in frame, at which life stage, what they wear in this scene, location, period, time of day, weather, occasion, props and continuity with the previous panel. Pictures are built from this context.
   - *Editor:* rereads it as a first-time reader and sharpens captions and dialogue for context and specificity.
   - *Cover art director* (`src/lib/engines/cover.ts`): detects the genre, then proposes **three different cover ideas** (approach, detailed art brief, title typeface and colours); the user picks one on the storyboard before anything is drawn.
3. **Page layouts** (`src/lib/layouts.ts`): 12 comic-book layouts from a full-page splash to 6-panel grids; big panels for big moments.
4. **Art Engine** (OpenAI `gpt-image-2.5-flare`, chosen in the model benchmark — see `docs/benchmark-pilot-results.md`) draws a cover plus every panel in its real shape (wide, tall or square), art only, no text. For every panel, the approved design sheets of the characters in that scene (up to 4) are sent as reference pictures, so faces and outfits stay consistent. Paced for OpenAI's images-per-minute limit with automatic retries.
5. **Render Engine** (browser canvas) letters every page: caption boxes and speech / shout / whisper / thought balloons in reading order, per-style lettering (fonts, caption colours, page colour). Downloads as a print-ready PDF (2:3 pages) or per-page PNG.
6. Comics are saved on local disk under `storage/comics/<id>/` and viewed at `/comic/<id>`.

Cost per comic (Oct 2026 prices, medium image quality): roughly $2–3 for a 10-page comic (~40 images at ~$0.05, plus ~$0.50 of Claude).

Not yet built: login, payments, file/CV upload, preview/paywall, social exports, automatic quality checks, sound effects (SFX), social features on Explore. Research into better models and custom style training is planned (see the roadmap discussion in the PR history).

## Eventual product flow

1. **Get inspired** — browse example comics and styles; "Create like this" / "Remix".
2. **Tell us your story** — paste text, upload a file/CV, or chat with the AI until it understands the people, timeline, moments and tone.
3. **Build your story** — rough pages with stick-figure panels. Edit dialogue, captions, scenes and panel order. No expensive final art yet.
4. **Meet your characters** — important characters detected from the story; upload reference photos → quality check. Minor characters can be described or AI-generated.
5. **The magic moment** — generate ONE finished cover/preview so the user sees the real visual style.
6. **Paywall** — Mini (1 page) • Story (8–10 pages) • Epic. Pay before the expensive full render. No credit system in V1.
7. **Generate the comic** — Story Bible + Characters + Style → consistent panel art → renderer → finished comic.
8. **Edit & share** — edit dialogue without regenerating art, limited panel regenerations; export web comic, PDF, Instagram carousel, animated Reel.

## The five engines

| Engine | Job | v1 implementation |
| --- | --- | --- |
| Story Engine | Conversation/file → structured story | `src/lib/engines/story.ts` (Claude) |
| Storyboard Engine | Story → pages, panels, scenes, dialogue | Writer + editor passes in `story.ts`, layouts in `layouts.ts` |
| Character Engine | Photos → consistent character references | `src/lib/engines/characters.ts` + `src/lib/cast-service.ts`: cast planning, photo check, design sheets, approval |
| Art Engine | Panel instructions → comic illustrations | `src/lib/engines/art.ts` (OpenAI) |
| Render Engine | Art + typography + bubbles → final comic & social formats | `src/lib/engines/render.ts` (canvas → PDF/PNG) |

## Build order

Mock UX → Story AI → Character engine → Image engine → Payment → Share/growth.

- Phase 1 — UX prototype: gallery → story → storyboard → character upload → preview → fake checkout → finished comic → share.
- Phase 2 — Story AI: conversational story engine and storyboard generation.
- Phase 3 — Character + art: character references, consistency checks, image generation, panel editing.
- Phase 4 — Commerce: real payment, entitlements, downloads, generation limits.
- Phase 5 — Sharing + growth: carousel/Reel exports, SEO pages, blog, analytics.

## Likely tools (long term)

Next.js + React • Supabase (DB/auth) • fal.ai + FLUX / Kontext (art + character consistency; LoRA only when needed) • Cloudflare R2 (storage) • Razorpay / Stripe • PostHog. Story AI: Claude in v1 (plan doc lists OpenAI — revisit after benchmarking).

## Cost principle

Keep everything before final art mostly text and wireframes. Generate only one costly preview before payment. Early target: roughly ₹200–₹300 of AI/infra cost per standard paid comic — to be validated with real API benchmarks.

## Not in V1

AI voice narration • public creator/community system • unlimited regenerations • credit-heavy pricing • automated Instagram/Meta ad management • dozens of styles or pro comic-editing tools.
