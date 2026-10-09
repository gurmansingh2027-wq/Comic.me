# Comic.me — Product

> Shared source of truth for everyone (and every coding agent) working on this repo.

Turn a personal story, CV, couple journey or memory into a polished comic. The product should do most of the creative work for the user; it is not a complicated comic-making tool.

**V1 success test:** Can someone tell us a meaningful story, see themselves in the preview, and feel that the finished comic is worth paying for?

## Current status (v3 — building the new flow step by step)

New flow: **Your story (voice) → Style → Characters → Storyboard → Your comic.** Steps marked ✅ are built.

- ✅ **Your story — voice interview** (`/create`). Tap the mic and talk (or type). Claude (`src/lib/engines/interview.ts`) reacts and asks one follow-up question at a time (usually 4–7), read aloud by OpenAI text-to-speech (`gpt-4o-mini-tts`); answers are transcribed with `gpt-transcribe` (`src/lib/engines/voice.ts`). When it has enough (or the user says so) Claude writes the story up with a cast list; the user edits it and **locks** it. English only for now. Progress survives a page refresh.
- ✅ **Style** — five signature styles with radically different visual grammars (Prestige, Chaos, Ink, Manga, Pop) plus nine classic ones (incl. Bold Graphic and Euro Comedy, added from the founder's art-direction references). Each is a **style recipe** in `src/lib/styles.ts`: how it's drawn (line, anatomy, colour, light, texture), how it directs the story (interpretation, camera, pacing, panel density), cover direction, an avoid-list and an optional LoRA slot. Style is chosen before characters and storyboard on purpose: it changes how the story is staged, and character designs are drawn in it.
- ✅ **Characters** (`/comic/<id>/characters`). Claude reads the locked story and lists the cast, marking each person main, supporting or minor (`src/lib/engines/characters.ts`). For each main/supporting character the user either uploads 1–4 photos or lets AI suggest a look. Claude checks the photos (good / needs another photo / unusable, with a friendly explanation). OpenAI draws a character design sheet (full body + portrait) in the chosen style, from the photos when given. The user approves it or asks for changes (up to 6 designs per character). On approval Claude writes a precise description of the design. Minor characters are drawn from their text description. Users can edit, add or remove characters. Business logic lives in `src/lib/cast-service.ts`.
  - **Character Bible:** identity (face, skin, hair, build, recognisable markers) is kept separate from clothes; typical wardrobe; the main age; and **life stages**, inferred automatically from the story's timeline (e.g. met as kids → college → wedding → founder years), each with how they look and what they wear in that chapter. The Characters page shows them as "Name, through the years" with every age the story needs; when the story has no meaningful age change, no age UI is shown at all. Approving the main look draws every other age straight away (each must still be approved). Ages really change: height, proportions, facial maturity, hair of the time, outfit and accessories, while face, skin tone and markers stay. Design sheets show who someone is; clothes come from each scene, and the sheet's outfit is stripped from every panel prompt.
- ✅ **Storyboard** (`/comic/<id>/storyboard`). The flow is a real state machine: Characters → **Storyboard** (writing progress, then review) → approval → drawing → **Your comic**. Writing happens on the Storyboard step (no jump to step 5 and back), and every paid picture is gated by `drawingApproved()` on the server. Wireframe pages with code-drawn stick figures framed by camera shot. Edit title, tagline, cover idea, each panel's scene, caption, dialogue (speaker, balloon type, side) and sound effect; mark up to 2-3 ⭐ hero panels; add/remove/reorder panels and pages; pick layouts (incl. ⚡ dynamic slanted and inset layouts). Captions, balloons and sound effects can be dragged anywhere and resized. Autosaves; shows estimated drawing time and cost (hero panels included). **Approving opens a title check** ("This is the title we'll design the cover around", with 2-3 alternatives) before anything is drawn (`src/components/StoryboardEditor.tsx`, `src/components/StoryboardWriting.tsx`, `src/components/WireframePage.tsx`, `src/lib/script-edits.ts`).
- ✅ **Your comic** — as below. On the finished comic, captions, balloons and sound effects can still be dragged, resized and edited (free: only lettering changes, the art is never redrawn), and any single panel or the cover can be redrawn with a requested change.
- 🌍 **Explore + Recreate** (prototype): `/explore` is a full-bleed, dark, dense masonry wall built only from comics already made: each comic contributes its lettered cover, a lettered page, its hero panels and its biggest panels, in mixed shapes (tall, wide, square, two-column features). Hover darkens the art and shows title, style, tagline and **Recreate →**. The wall loads 30 tiles at a time and keeps loading as you scroll (`/api/explore`). For the prototype **every comic is on Explore by default** ("Hide from Explore" on the finished comic; photos and design sheets are never shown). **Recreate** opens the builder with that comic's *creative recipe* (style, page count, layout rhythm, pacing, hero-panel count and placement, dialogue density, silent panels, SFX use, cover composition family and title treatment) and asks "What's your story?"; the story, names, dialogue and photos are never copied (`src/lib/explore.ts`, `src/components/ExploreWall.tsx`, `remixPresetFor` in `src/lib/comic.ts`). The home page shows a strip of the wall. No accounts or social features yet.
- 🔍 **Continuity + visual QA** (built after the "Corners Are for Winning" dry run, where 14 of 41 pictures had hard continuity failures: see `research/corners-are-for-winning-failure-analysis.md`).
  - **Object Bible / "Important things"** on the Characters page: recurring cars and objects the story depends on are planned like characters, with locked attributes (colour, body kit, livery, driver side), explicit states (e.g. "damaged") and an approved canon design sheet that is sent as a reference whenever the thing is in frame (`src/components/ObjectStudio.tsx`, `src/lib/cast-service.ts`).
  - **Look policy** per character: *Keep this look* (the approved outfit in every scene of that life stage), *Dress for the story* (default: identity stays, clothes follow the scene) or *Ask me for big changes* (the storyboard shows each proposed change with "Use this change" / "Keep approved look"; nothing is approved by generated text).
  - **Continuity Ledger** (`src/lib/continuity.ts`): built from the storyboard before drawing: who is in frame at which age wearing what, who is inside which vehicle, which canon objects are visible in which state, which way the action travels and who is ahead, and which earlier panel each one continues. It lints the storyboard for free (duplicate people, unknown objects, direction flips, mid-scene age changes), fixes what is safe and blocks approval on the rest.
  - **One drawing service** (`src/lib/drawing-service.ts`) for first drawings and redraws: canon sheets, the right-age design sheets and the previous accepted panel go in as references; every candidate is inspected by Claude vision against the ledger (`src/lib/qa/visual-qa.ts`) before it is accepted. Hard failures are redrawn with the inspector's fix, the last attempt (2 for simple shots, 3 for risky ones) uses a prepared simpler composition of the same beat, uncertain verdicts escalate once and never pass, and rejected candidates never reach the comic. Dependent panels wait for their predecessor; independent scenes draw three at a time.
  - **Page and final checks** (`/api/comics/<id>/qa`): each lettered page is rendered in the browser and inspected for cross-panel drift and balloon placement; a final pass checks adjacent pictures across page boundaries and the whole book in readable batches. PDF/PNG downloads and Explore publishing need current passing checks; lettering edits only invalidate the page/final checks, never redraw art. Cost about $0.03 per picture check at low effort (`COMICME_FAKE_QA=1` mocks it in test mode).
- ⏱ Countdown timers (with a safety buffer) on every slow step: finding the cast, photo checks, character designs, writing, each panel and the whole comic (`src/components/Countdown.tsx`).
- 💰 Cost log: every paid AI call is measured (provider, model, operation, tokens or image size/quality/references, audio seconds, retries) and logged on the comic with its real cost, priced from the usage the provider reports (`src/lib/meter.ts`, prices in `src/lib/costs.ts`). The voice interview's calls are collected per interview session and attached to the comic when the story is locked. The storyboard's cost estimate uses the current image model and counts each panel's reference pictures. The comic page shows the total, and `node scripts/cost-report.ts --detail` prints every comic and call.

How the comic itself is made:

1. The locked story, the interview transcript and the approved cast go to the Story Engine. The writer must use the cast's exact names and looks.
2. **Story Engine** (Claude, `claude-opus-5-5`), in two passes, running in the background while the page shows progress:
   - *Comic Director:* story bible (logline, tone, arc, how each person talks) → interprets the story in the chosen style → chooses the length (typically 6–10 pages, max 12 pages / 40 panels) → plans each page with a real comic layout by narrative importance → writes each panel (shot, scene, caption, balloons) **with structured scene context**: who is in frame, at which life stage, what they wear in this scene, location, period, time of day, weather, occasion, props and continuity with the previous panel. Pictures are built from this context. It also picks the book's **1-2 hero panels** (3 for 10+ pages) for narrative reasons (reveal, victory, first kiss, biggest joke…, never just panel 1), and adds activity, camera and relationships to each panel's scene context.
   - *Dialogue writer:* rewrites every caption and balloon knowing each person's voice, the relationship, their age, the scene, the emotion, the tone and the **style's dialogue direction** (Prestige restrained, Chaos absurd, Ink sparse, Manga emotional rhythm…). Less text, more subtext, no narrating what we can see; robot balloons, *emphasis* and sound effects where they fit; offers 2-3 alternative titles.
   - *Cover art director* (`src/lib/engines/cover.ts`): detects the genre, brainstorms six ideas across **16 composition families** (graphic-minimal, negative space, tiny figure/giant world, symbolic object, silhouette, split, collage, editorial design, action freeze…), keeps the **three strongest**, and art-directs each title: one of 15 typefaces, size (not always huge), position, alignment, case, tracking, tilt and treatment (solid, outline, shadow, band, hollow, stacked). The user picks one on the storyboard before anything is drawn.
3. **Page layouts** (`src/lib/layouts.ts`): 16 comic-book layouts from a full-page splash to 6-panel grids, plus dynamic ones (diagonal split, slanted bands, zigzag, full page + inset) used sparingly; big panels for big moments.
4. **Art Engine** (OpenAI `gpt-image-2.5-flare`, chosen in the model benchmark — see `docs/benchmark-pilot-results.md`) draws a cover plus every panel in its real shape (wide, tall or square), art only, no text. For every panel, the approved design sheets of the characters in that scene (up to 4) are sent as reference pictures, so faces and outfits stay consistent. Paced for OpenAI's images-per-minute limit with automatic retries. **Hero panels** get an extra-ambitious prompt from the style's hero direction and are drawn at high quality and ~1.6 MP (`HERO_IMAGE_QUALITY`).
5. **Render Engine** (browser canvas) letters every page: caption boxes; speech / shout (spiky, bigger) / whisper (small, dashed) / thought / robot (geometric) balloons in reading order; *emphasised* words in bold italic; per-style lettering (fonts, balloon and caption colours, page colour, per-speaker accent outlines in playful styles); **sound effects** lettered big and tilted (on a starburst in Pop); a **halftone print texture** over the art in Pop, sized by how dark the art is; art clipped to slanted panel outlines. Covers are lettered in code too: the art director's title treatment, a tagline that checks the art behind it so it always stays readable, and a small publisher mark. Downloads as a PDF (2:3 pages, 1600×2400 pixels, about 240 dpi: fine for screens and home printing; professional print would need sharper artwork) or per-page PNG.
6. Comics are saved on local disk under `storage/comics/<id>/` and viewed at `/comic/<id>`.

Cost per comic (Oct 2026 prices, medium image quality): roughly $2–3 for a 10-page comic (~40 images at ~$0.05, plus ~$0.50 of Claude), plus about $1.5–3 of visual QA (one Claude vision check per picture, more for retries, escalations, page and final checks).

Not yet built: login, payments, file/CV upload, preview/paywall, social exports, art breaking out of panel borders, social features on Explore. Style research for the next directions is in `research/style-directions.md`; art-direction references are documented in `research/visual-references/README.md`; the product voice is in `docs/voice-and-copy.md`.

Testing without spending: `COMICME_FAKE_IMAGES=1` draws grey placeholder pictures instead of calling OpenAI, `COMICME_FAKE_QA=1` passes every visual check, and `COMICME_STORAGE_DIR` points the app at a separate folder of test comics (see `docs/testing.md`).

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
