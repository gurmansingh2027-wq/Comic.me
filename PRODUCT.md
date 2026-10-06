# Comic.me — Product

> Shared source of truth for everyone (and every coding agent) working on this repo.

Turn a personal story, CV, couple journey or memory into a polished comic. The product should do most of the creative work for the user; it is not a complicated comic-making tool.

**V1 success test:** Can someone tell us a meaningful story, see themselves in the preview, and feel that the finished comic is worth paying for?

## Current status (v1 — built)

The smallest end-to-end version of the flow:

1. User types their story (with example starters) and picks one of 6 styles.
2. **Story Engine** (Claude, `claude-opus-5-5`) writes a 6-panel script: title, character sheet, and per panel a scene description, narrator caption and up to 2 speech bubbles.
3. **Art Engine** (OpenAI `gpt-image-2`) draws each panel in parallel — art only, no text.
4. **Render Engine** (browser canvas) adds our own captions and speech bubbles on top, and builds a downloadable PNG page.
5. Comics are saved on local disk under `storage/comics/<id>/` and viewed at `/comic/<id>`.

No login, payments, gallery, uploads, storyboard editing or photo references yet.

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
| Storyboard Engine | Story → pages, panels, scenes, dialogue | Part of the story engine for now |
| Character Engine | Photos → consistent character references | Text character sheet repeated in every panel prompt |
| Art Engine | Panel instructions → comic illustrations | `src/lib/engines/art.ts` (OpenAI) |
| Render Engine | Art + typography + bubbles → final comic & social formats | `src/lib/engines/render.ts` (canvas) |

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
