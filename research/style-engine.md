# Style Engine: visual grammars, style recipes, style × character

> Style is not a filter. It changes **what the story looks like as a sequence** (shots, exaggeration, humour, pacing) before it changes how a single picture is rendered.

## 1. The four signature grammars

### PRESTIGE: blockbuster Western comic polish
- **Drawing:** grounded, heroic anatomy; confident varied-weight inks with feathering and big spot blacks; professional digital colour with rim light and volumetric light; rich, believable environments.
- **Directing:** treat ordinary life as an epic. Extreme low and high angles, deep foreshortening, scale contrast, close-ups on eyes and hands; build with tight panels, release into splashes; end pages on cliffhangers.
- **Covers:** one iconic, larger-than-life focal image; dramatic perspective; lens-flare lighting.
- **Failure modes to guard against:** soft painterly rendering without ink lines (we saw this in the first sample and fixed it); stiff poses; muddy colour.

### CHAOS: original absurd adult sci-fi comedy
- **Drawing:** simple, bold, readable cartoon shapes; slightly wobbly uniform outlines; rubbery exaggerated anatomy, bulging or pinprick eyes, extreme reaction faces; flat punchy colours with acid accents; aliens with improbable body plans.
- **Directing:** reinterpret every ordinary moment through escalating absurd logic (the security scanner becomes sentient, the boss is a three-eyed slug) while keeping the real emotional beat underneath, played deadpan. Sitcom framing for timing, sudden extreme close-ups, characters staring at the reader. Every page lands a visual punchline.
- **Originality rule:** the creative territory of adult animated sci-fi comedy, never a specific show's characters or exact look.

### INK: intentional hand-drawn line art
- **Drawing:** brush and fine-nib pen with natural pressure variation; crosshatching and stippling; black ink on warm paper with at most one spot accent colour; visible paper grain and dry-brush texture.
- **Directing:** say more with less. A clock, an empty chair, a tiny plane leaving. Few, larger panels; silent panels; generous negative space.
- **Sub-styles for later** (same recipe shape, different `render` text): clean ink, expressive brush, monoline, sketch/pencil, crosshatch, editorial.
- **Failure mode:** "colour image + edge filter". Ask for drawn line art explicitly, and consider Anime2Sketch-style line extraction for QA.

### MANGA
- **Drawing:** clean G-pen line art, screentones and gradients, speed and focus lines; black and white only.
- **Directing:** decompressed pacing; reaction shots and emotional close-ups; impact frames for action; thought balloons.
- **Sub-genres for later:** energetic shōnen (action, impact frames), romantic shōjo (flowers, sparkles, soft tones), cinematic seinen (realistic proportions, heavy blacks, detailed environments).

## 2. Style recipe (implemented)
`src/lib/styles.ts` stores each style as data:

| Dimension | Field | Example (Chaos) |
|---|---|---|
| Overall signature | `render.signature` | original adult animated sci-fi comedy look |
| Line | `render.linework` | slightly wobbly uniform outlines |
| Anatomy / exaggeration | `render.anatomy` | rubbery, oversized heads, extreme reaction faces |
| Colour / saturation / contrast | `render.colour` | flat punchy cel colours with acid accents |
| Light & shadow | `render.lightingAndShadow` | cel shadows; glowing sci-fi light sources |
| Detail & texture (halftone, screentone, hatching, paper) | `render.detailAndTexture` | clean backgrounds full of absurd sight gags |
| Story interpretation | `direction.interpretation` | escalate ordinary moments into absurd sci-fi logic |
| Camera dynamism | `direction.camera` | sitcom framing + sudden extreme close-ups |
| Pacing | `direction.pacing` | setup → beat → punchline |
| Panel density | `direction.panelDensity` | dense |
| Cover direction | `cover` | absurd visual gag, deadpan hero |
| Negative prompt | `avoid` | realistic rendering; copying any existing cartoon |
| Lettering | `lettering` | page colour, caption colours, fonts |
| Trained style | `lora` (optional) | `{ url, trigger, scale }` for FLUX-type models |

How it flows: `render` → art direction for every image; `direction` + `cover` → the Comic Director and cover art director (so the **storyboard itself differs by style**); `lettering` → the renderer; `lora` → the provider adapter once we run FLUX.2 [dev] or Qwen.

## 3. More style families (future, same recipe shape)
Cinematic graphic novel · anime · noir · European ligne claire · indie/zine · pulp · pop/halftone · painterly · watercolour · storybook · doodle · children's illustration · cyberpunk · horror · retro · pixel · stylised 3D · newspaper/editorial · minimalist · absurd comedy · psychedelic · collage/mixed media.
Several already exist as classic styles (ligne claire, Sunday strip, modern cartoon, graphic novel, noir, watercolour, Desi classic). Adding one = one recipe entry + one sample picture (`node scripts/make-style-samples.ts <id>`).

## 4. Character × style independence
We want *Gurman × Prestige*, *Gurman × Chaos*, *Gurman × Ink* and *Gurman × Manga* to be recognisably the same person.
- **Identity lives in data, not pictures.** The Character Bible's `identity` (face, skin, hair, build, markers) is style-free text, and the user's photos are style-free references.
- **Design sheets are per style.** A sheet is drawn in the comic's style from identity + photos + the style sample. Switching style = redraw sheets (cheap: ~$0.05–0.08 each), keeping identity and photos.
- **Panels combine four separable inputs:** identity (sheet for the right **life stage**) × wardrobe (from scene context) × pose/emotion/action (scene context) × style (recipe + sample + optional LoRA).
- **With LoRAs:** style LoRA + reference images for identity is the standard modern combination (FLUX.2 [dev] accepts both). Per-character identity LoRAs are only worth it for long-running characters (e.g. a premium "series" product); references are cheaper and need no training.

## 5. Training proprietary Comic.me styles
See `docs/comicme-training-strategy.md`. In short: 20–50 consistent, **licensed** images per style, panel crops, captions with a trigger word, and FLUX.2 [dev] or Qwen-Image LoRA training on fal.ai (~$2–7 per run). Then benchmark against prompt-only styles before shipping.
