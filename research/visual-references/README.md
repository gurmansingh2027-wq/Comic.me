# Visual reference library

> Art-direction references the founder attached on 9 Oct 2026, treated as **product requirements**, not decoration.
> We learn the craft from them. We never copy characters, costumes, logos, layouts pixel-for-pixel, or anyone's story.

**Files.** The images sit next to this README on the founder's machine. Only `02_current_boring_cover.png` (our own art) is committed. The others are third-party copyrighted or licensed images, so `.gitignore` keeps them out of this public repo. Ask the founder for the originals if you need them.

---

## 01_higgsfield_explore_reference (Higgsfield "Eyes In" examples wall)
**Source:** https://higgsfield.ai/effects/examples/eyes-in (screenshot).

USE FOR:
- Explore as an almost entirely visual, immersive wall: very little chrome, very little dead space.
- Dense masonry with unequal tiles: portrait, landscape, square and very tall side by side, tight gutters (~6-8 px), small corner radius.
- Hover: the image darkens, the name appears over it, plus one clear CTA (theirs is "Try for free", ours is **Recreate →**).
- The feeling of endless scrolling.

DO NOT USE FOR:
- A regular grid of same-size rounded SaaS cards.
- Their photography, people or branding.

**Applied in:** `src/components/ExploreWall.tsx` (measured masonry, 2-column spans), `src/components/ExploreTile.tsx` (darken + title/style/Recreate on hover).

## 02_current_boring_cover (our cover for "Same Time Next Tuesday")
**Failure reference.** This is what we don't want.

PROBLEMS:
- A generic, template-driven title: giant centred serif, too dominant, not art-directed around the story.
- A safe composition.
- The tagline ("Nobody wants just one. Almost nobody.") disappears: white text on light art at the very bottom.
- Doesn't feel unique to this story.

**Fixed by:**
- Title treatments that vary per story (size, alignment, case, tracking, tilt, outline/shadow/band/hollow/stacked).
- 15 cover typefaces.
- Automatic contrast for the tagline, which checks the art behind it (`drawCover` in `src/lib/engines/render.ts`).
- Composition families in the cover art director (`src/lib/engines/cover.ts`).

## 03_prestige_batman_reference (a mainstream superhero panel)
USE FOR (quality bar for **hero panels** in Prestige):
- Extreme perspective: worm's-eye, with the figure looming over the reader.
- A bold foreground shape (the cape, the gargoyle) framing the subject.
- Confident massed blacks; a silhouette against a lit sky.
- A detailed environment (gothic architecture) that gives scale.
- A dramatic hierarchy: one focal point, everything else supports it. It feels authored at a glance.

DO NOT USE FOR:
- Batman's identity, costume, bat symbol, logos or Gotham.
- Copying this composition one-to-one.

**Applied in:** the Prestige recipe's `direction.hero` (`src/lib/styles.ts`), and the hero-panel prompt in `panelJob` (`src/lib/engines/art.ts`).

## 04_pop_comic_layout_reference (stock pop-art page)
USE FOR:
- Diagonal panel borders and irregular framing.
- Explosive compositions: a starburst as the centre of gravity.
- Comic-native page language instead of spreadsheet rectangles.
- Bright flat colour fields with halftone and speed-line texture.

DO NOT USE FOR:
- Constant use. Dynamic layouts follow story + style + importance.
- The stock artwork itself.

**Applied in:** the `slash-2`, `diagonal-3`, `zigzag-4` and `inset` layouts (`src/lib/layouts.ts`), with even gutters on slanted edges (`pageFrames` in `render.ts`).

## 05_pop_comic_sfx_reference (stock pop-art SFX pattern)
USE FOR:
- Bold SFX lettering (OOPS!!!, POOF!, BOOM!): chunky letters, thick outline, offset shadow, tilt.
- Halftone dots (Ben-Day), starbursts and smoke puffs.
- Bright primaries and overlapping elements.
- Remembering that comics can be **fun**.

DO NOT USE FOR:
- Plastering SFX on every panel.
- The stock artwork itself.

**Applied in:** `Panel.sfx`, lettered by `drawSfx` (style-specific colours via `lettering.sfxFill/sfxOutline`). The writer adds SFX only where the style and moment want them.

## 06_prestige_cyborg_reference (a mainstream superhero splash)
USE FOR (the second quality bar for hero panels):
- Anatomy and a weight-bearing, heroic pose; foreshortening from a low camera.
- Detailed linework and polished mainstream colour.
- Coloured rim light and a glowing light source.
- A strong character presence against a rich, busy environment that is still readable.

DO NOT USE FOR:
- Cyborg's design, armour, logos or story.

**Applied in:** Prestige `render` and `direction.hero`. Hero panels are drawn at higher quality and resolution (`HERO_IMAGE_QUALITY`, `HERO_PIXELS`).

## 07_innovative_dialogue_reference (lettering with per-speaker treatments)
USE FOR:
- Different outline colours and shapes per speaker, so lettering becomes part of the storytelling.
- Rhythm in balloon placement: stacked connected balloons, pauses.
- Emphasis: **bold italic** stressed words inside balloons.

DO NOT USE FOR:
- Over-decorating every balloon. Readability comes first.
- Copying the characters or the text.

**Applied in:**
- `lettering.speakerAccents` (per-speaker outline colours; on in Chaos).
- The `robot` balloon (geometric, double outline) for machines, AIs and monsters.
- Smaller dashed whispers and bigger shouts.
- `*emphasis*` rendered in bold italic. The dialogue writer uses it sparingly.

## 08_innovative_cover_reference (a variant superhero cover)
USE FOR (an important cover benchmark):
- Unconventional composition: the character crouches off-centre instead of posing in the middle.
- Flat graphic colour shapes behind the figure, and lots of negative space.
- Illustration and graphic design working together; the title treatment feels intentional.
- Restrained but memorable: less information, more identity.

DO NOT USE FOR:
- Black Panther's design, costume, logo or the Marvel trade dress.

**Applied in:**
- The `graphic-minimal`, `geometric-abstract`, `negative-space` and `editorial-design` composition families.
- The cover prompt now commits to the chosen family ("don't fall back to a centred character posing in front of a background").
- Title size defaults can be small and confident.
