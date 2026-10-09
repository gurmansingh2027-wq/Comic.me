# Style directions: deeper research (October 2026)

> Companion to `research/style-engine.md` (PR #4). That file defines the recipe shape; this one goes deeper into the craft of six families and maps the wider library.
> Principle: **style is not a filter.** Every direction below changes the *storyboard* (camera, pacing, panel density, what's funny or dramatic), the *dialogue*, the *lettering*, the *cover* and the *hero panels*, not just the rendering.
> We study traditions and techniques, never specific copyrighted characters, and never imitate a named living artist.

## The recipe (what a style controls in code)
Each style is one entry in `src/lib/styles.ts`:

- `render`: signature, line, figures, colour, light, detail. Sent with every picture.
- `direction`: interpretation, camera, pacing, panel density, and (new) **dialogue** and **hero**. Used by the Comic Director, the dialogue writer and hero-panel prompts.
- `cover`: cover direction. The cover art director also picks a composition family and a title treatment.
- `avoid`: a negative list.
- `lettering`: page and caption colours, fonts, and (new) balloon fill and ink, **per-speaker accents**, and **SFX colours**.
- `lora`: an optional trained style for FLUX-type models later.

**Adding a style** = one recipe entry plus one sample image (`node scripts/make-style-samples.ts <id>`, about $0.05). No other code changes.

---

## 1. Prestige Western comic (deeper)
**Quality bar:** references 03 (gothic rooftop) and 06 (cyborg splash). What separates "authored" from "AI illustration":

| Craft | What it means | Prompt and pipeline lever |
| --- | --- | --- |
| Anatomy & gesture | Weight on one leg, a clear line of action, hands that act | "dynamic, weight-bearing poses with clear gesture lines"; avoid "stiff poses" |
| Foreshortening | Limbs and props thrust toward camera | Camera field: "worm's-eye, wide lens"; hero prompt: "push the camera further than any other panel" |
| Confident inking | Varied line weight, feathering, crisp contours | `render.linework`; avoid "soft painterly rendering without ink lines" |
| Black shapes | Big, designed masses of black that read as shapes | "massed spot blacks"; silhouette against light |
| Cinematic light | Key + rim + volumetric; coloured light sources | `lightingAndShadow` |
| Sophisticated colour | Limited palette per scene, one accent, atmospheric depth | Scene-level palette in the director's scene text |
| Perspective & environment | 2-3 point perspective, architecture giving scale | Detailed `location` in scene context; hero panels get extra environment |
| Selective detail | Detail where the eye lands, restraint elsewhere | Hero prompt: "clear focal point" |
| Splash composition | One image carries a page | `splash` layout + `hero: true` |

**Directing:** build tension in tight panels, release into a splash; end pages on turns. Dialogue is restrained (few words, weight, silence before the big line).
**Failure modes:** a painterly look without ink; everything equally detailed (no hierarchy); mid-shots everywhere; plastic colour.
**Hero panels:** high quality, about 1.6 MP, with the style's hero direction (worm's-eye or overhead, a foreground framing shape, a silhouette, volumetric light).

## 2. Line art / ink: a major style family
Line art must look **intentionally drawn**, never "a colour image run through an edge detector". Ask for drawn line art explicitly, keep colour out (or limit it to one accent), and QA for fake-looking uniform edge lines.

| Sub-style | Signature | Best for | Lettering |
| --- | --- | --- | --- |
| Clean fine line | Even, precise fine-liner; minimal hatching | Quiet modern stories, startup and travel | Hand font, light captions |
| Variable ink | Brush-pen swell and taper; spot blacks | Drama, romance | Hand |
| Heavy brush | Thick wet strokes, dry-brush edges, big blacks | Noir-ish memoir, sports grit | Comic caps |
| Cross-hatching | Tone built from layered hatching | Period stories, nostalgia | Typewriter captions |
| Scratchy ink | Nervous, energetic, imperfect lines | Comedy, chaos at home, teenage years | Hand |
| Architectural drawing | Ruled perspective, precise buildings, tiny figures | Cities, migration, "the house we grew up in" | Clean caps |
| Monoline | One weight, geometric, graphic | Editorial, explainer stories | Grotesk-style |
| Pencil | Graphite tone, construction lines left in | Sketchbook memories, childhood | Hand |
| Graphite (rendered) | Soft value modelling, smudges | Grief, intimacy | Hand |
| Loose sketch | Gesture-first, unfinished edges | Travel journals, quick comedy | Hand |
| Editorial illustration | Bold idea, flat shapes, conceptual | Career, startup metaphors | Editorial |
| Ink wash | Ink line + grey or sepia wash values | Family sagas, monsoon moods | Typewriter |
| Ink + one accent | Black ink + one spot colour (vermilion/indigo) | **Current Ink style**, covers | Hand |
| Detailed hand-drawn rendering | Dense, obsessive detail, stippling | Hero panels, fantasy | Comic caps |

**Implementation:**
- Keep `ink` as the umbrella style and expose sub-styles as variants (same recipe shape, a different `render` text and lettering).
- The best LoRA candidate (consistent, distinctive, hard to prompt).
- Benchmark Nano Banana 2 / Seedream for pen-and-ink fidelity (they scored 5/5 on ink in the pilot).

## 3. Clear-line European (original direction)
**Principles** (the broad tradition behind classic Franco-Belgian adventure albums):
- One uniform clean contour, no hatching.
- Readable silhouettes.
- Flat controlled colour with very restrained shading.
- Simplified, slightly cartoony characters in highly detailed, architecturally accurate environments.
- Visual readability above all.

**Directing:**
- Wide establishing panels full of real places.
- Steady 4-panel tiers; humour from staging and timing; exposition carried by crisp dialogue.
- Adventures, travel, city life.

**Lettering:** neat mixed-case or caps, white balloons, pale yellow captions.
**Hero panels:** grand vistas with precise architecture and tiny readable figures.
**Originality:**
- Our own character design language: faces built from simple shapes, but recognisably the user (glasses, turban, beard and hair shapes are perfect clear-line markers).
- No quiffs-and-dog pastiche.
- The existing `ligne-claire` style is the base; the new `dialogue` and `hero` directions push it further.

## 4. Expressive European comedy (original direction)
**Principles** (the broad tradition of big-nosed, big-hearted European humour albums):
- Caricature and expressive anatomy: big noses, round bodies, tiny legs.
- Readable acting; exaggerated reactions (flying sweat, bulging eyes, hats popping off).
- Funny crowd scenes with sight gags; energetic, readable action.
- Strong silhouettes; squash and stretch.
- Staging that reads in one glance.

**Directing:** a gag every page; the crowd as a chorus; slapstick escalation; a running joke; a big group splash at the climax.
**Dialogue:** puns, comic insults, deadpan asides, sound effects for every bump.
**Lettering:** chunky hand caps; SFX on (POW, BONK in round letters).
**Why it matters for Comic.me:** weddings, family trips, office parties and cricket matches with 20 relatives are exactly the stories people tell. This style makes crowds an asset rather than a consistency problem: minor characters can be caricatures.
**Risk:** identity in caricature. The user must still recognise themselves, so keep the identity markers (turban, glasses, beard shape) and exaggerate everything else.

## 5. Pop comic (references 04, 05)
**Principles:**
- Ben-Day dots and halftone.
- Primary colours (red, yellow, blue) plus black.
- Thick bold outlines; graphic shapes and starbursts; speed lines.
- Giant SFX as composition elements.
- Playful framing (diagonals, insets, panels breaking borders); exaggerated movement.
- Expressive balloon design.

**Directing:** every page has an "explosion" beat; reaction close-ups with halftone backgrounds; dynamic layouts (`zigzag-4`, `slash-2`) used more often than in other styles.
**Lettering:** SFX on, in yellow and red with a black outline; per-speaker accents; shout balloons more often.
**Hero panels:** a starburst-centred splash.
**Note:** halftone texture is better rendered in post (a canvas halftone filter on flat colour areas) than asked of the image model, which smears dots. This is a good candidate for a renderer-side effect.

## 6. Absurd adult sci-fi comedy (Chaos, deeper)
**Territory:** absurd aliens, strange anatomy, bizarre props, surreal worlds, ridiculous facial expressions, intentionally simple shapes, chaos and visual jokes.

**Craft:**
- Simple geometric construction with wobbly uniform outlines.
- Pupils as tiny dots or huge spirals; drool and sweat drops.
- Backgrounds with sight gags (sentient appliances, impossible machines).
- Acid colour accents on flat cels; portals and glowing goo as light sources.

**Directing:**
- Escalate the mundane into the cosmic (a parking ticket summons an intergalactic tribunal) while the real emotion stays deadpan underneath.
- Sitcom framing, then smash cuts to extreme close-ups; characters breaking the fourth wall.
- The robot balloon for aliens, AIs and machines; SFX for portals and splats.

**Originality:** no catchphrases, no lab-coat-scientist-and-nervous-grandson dynamic, no portal-gun design, no show palette.
**Implemented:** speaker accents and SFX colours for Chaos; the robot balloon.

## 7. The wider library (map, not built)

| Direction | Visual grammar in one line | Storytelling shift | Priority |
| --- | --- | --- | --- |
| Manga (shōnen/shōjo/seinen) | G-pen line, screentone, speed lines | Decompressed time, reaction shots | Live |
| Anime (colour) | Cel shading, glossy eyes, dramatic skies | Emotional beats, big skies | High |
| Noir | Chiaroscuro, rain, venetian blinds | Voice-over captions, fatalism | Live |
| Pulp | Painted 1940s covers, bold type | Cliffhangers, melodrama | Medium |
| Painterly | Gouache/oil texture, soft edges | Literary, slow | Live as Graphic Novel |
| Indie comics | Personal, flat colour, quirky line | Slice of life, awkward humour | High |
| Zine | Photocopy grain, collage, hand lettering | DIY memoir, music, activism | Medium |
| Storybook | Warm gouache, rounded forms | Children, family lore | Live as Watercolour |
| Horror | Negative space, stark contrast, uncanny | Dread, the reveal | Medium |
| Cyberpunk | Neon, rain, dense signage shapes | Tech careers, city nights | Medium |
| Psychedelic | Swirling linework, saturated gradients | Festivals, dreams | Low |
| Collage | Cut paper, photo textures, mixed media | Montage memories | Medium |
| Newspaper strip | Bold simple line, Ben-Day | Gag-a-day | Live |
| Editorial illustration | Concept-first, flat shapes | Careers, metaphors | High |
| Doodle | Notebook pen, playful | Notes to a partner, kids | Medium |
| Retro sci-fi | 50s-60s futurism, rounded chrome | Ambition, space-age optimism | Medium |
| Minimalist | Few shapes, lots of space | Poignant short stories | Medium |
| Stylised 3D | Clay or animated-film renders | Family-friendly, kids | Medium (needs a different model) |

## Recommendation: the first four to prototype

**Status (9 Oct):**
- Live now: **Pop** (with renderer halftone and starburst SFX), **Euro Comedy** and **Bold Graphic**. Bold Graphic is the design-led variant-cover look learned from reference 08.
- Prestige is pushed further toward references 03 and 06 (two-tone palettes, material texture, selective detail).
- Next up: Ink variants.

1. **Pop Comic.**
   - The most "fun" gap in the current line-up, and it uses the new SFX, speaker accents and dynamic layouts.
   - Halftone can come from the renderer, so the quality risk is low.
   - Strong for Explore thumbnails.
2. **Expressive European Comedy.**
   - Crowds and family events are the most common stories we hear.
   - Caricature turns the hardest consistency problem (many minor characters) into a feature.
3. **Ink sub-styles (variable ink, cross-hatching, ink wash)** as variants of Ink.
   - Signature, premium, printable; the best first LoRA candidate.
   - The benchmark showed some models already render ink well.
4. **Indie / editorial** (a modern flat-colour line with conceptual compositions).
   - Covers careers, startups and "grown-up" stories that don't fit superhero or cartoon styles.
   - Pairs with the editorial-design and graphic-minimal cover families.

**Not first:** stylised 3D (needs a different model), psychedelic (niche) and pulp (overlaps with Prestige and Noir).

## How to test (research → infrastructure → paid experiments later)
- Each new style needs a recipe, then a sample image, then the benchmark's 10 hard scenes (`scripts/benchmark.ts --styles <id>`), scored on the pilot's rubric. That's about $1.50 per style per model.
- Acceptance:
  - The same story storyboarded in two styles gives visibly different page plans.
  - Hero panels pass the "would you stop scrolling?" test.
  - Line art never looks like an edge filter.
