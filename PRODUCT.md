# Comic.me — Product

> Shared source of truth for everyone (and every coding agent) working on this repo.

Turn a personal story, CV, couple journey or memory into a polished comic. The product should do most of the creative work for the user; it is not a complicated comic-making tool.

**V1 success test:** Can someone tell us a meaningful story, see themselves in the preview, and feel that the finished comic is worth paying for?

## Current status (v3 — building the new flow step by step)

New flow: **Your story (voice) → Style → Characters → Storyboard → Your comic.** Steps marked ✅ are built.

- ✅ **Your story — voice interview** (`/create`). Tap the mic and talk (or type). Claude (`src/lib/engines/interview.ts`) reacts and asks one follow-up question at a time (usually 4–7), read aloud by OpenAI text-to-speech (`gpt-4o-mini-tts`); answers are transcribed with `gpt-transcribe` (`src/lib/engines/voice.ts`). When it has enough (or the user says so) Claude writes the story up with a cast list; the user edits it and **locks** it. English only for now. Progress survives a page refresh.
- ✅ **Style** — pick one of 9 styles, each shown with a sample picture.
- ✅ **Characters** (`/comic/<id>/characters`). Claude reads the locked story and lists the cast, marking each person main, supporting or minor (`src/lib/engines/characters.ts`). For each main/supporting character the user either uploads 1–4 photos or lets AI suggest a look. Claude checks the photos (good / needs another photo / unusable, with a friendly explanation). OpenAI draws a character design sheet (full body + portrait) in the chosen style, from the photos when given. The user approves it or asks for changes (up to 6 designs per character). On approval Claude writes a precise description of the design. Minor characters are drawn from their text description. Users can edit, add or remove characters. Business logic lives in `src/lib/cast-service.ts`.
- ⏳ **Storyboard** — editable wireframe pages: panel layouts, stick figures, add/remove panels and dialogue, before any expensive art. Not built yet.
- ✅ **Your comic** — as below.

How the comic itself is made:

1. The locked story, the interview transcript and the approved cast go to the Story Engine. The writer must use the cast's exact names and looks.
2. **Story Engine** (Claude, `claude-opus-5-5`), in two passes, running in the background while the page shows progress:
   - *Writer:* story bible (logline, tone, arc, how each person talks) → chooses the length (typically 6–10 pages, max 12 pages / 40 panels) → plans each page with a real comic layout → writes each panel (shot, scene, caption, balloons).
   - *Editor:* rereads it as a first-time reader and sharpens captions and dialogue for context and specificity.
3. **Page layouts** (`src/lib/layouts.ts`): 12 comic-book layouts from a full-page splash to 6-panel grids; big panels for big moments.
4. **Art Engine** (OpenAI `gpt-image-2`) draws a cover plus every panel in its real shape (wide, tall or square), art only, no text. For every panel, the approved design sheets of the characters in that scene (up to 4) are sent as reference pictures, so faces and outfits stay consistent. Paced for OpenAI's images-per-minute limit with automatic retries.
5. **Render Engine** (browser canvas) letters every page: caption boxes and speech / shout / whisper / thought balloons in reading order, per-style lettering (fonts, caption colours, page colour). Downloads as a print-ready PDF (2:3 pages) or per-page PNG.
6. Comics are saved on local disk under `storage/comics/<id>/` and viewed at `/comic/<id>`.

Cost per comic (Oct 2026 prices, medium image quality): roughly $2–3 for a 10-page comic (~40 images at ~$0.05, plus ~$0.50 of Claude).

Not yet built: login, payments, gallery, file/CV upload, storyboard editing before drawing, preview/paywall, social exports.

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
