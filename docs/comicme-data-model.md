# Comic.me data model

> Source of truth: TypeScript types in `src/lib/comic.ts` and `src/lib/styles.ts`. Comics are stored as JSON today (`storage/comics/<id>/comic.json`); the shapes below map 1:1 to future Postgres tables.

## Comic (one book)
```ts
Comic {
  id, createdAt, updatedAt,
  styleId,                 // → StyleRecipe
  story,                   // the locked write-up
  intake?,                 // interview transcript + people mentioned
  cast?: CastMember[],     // the Character Bible
  status: "draft" | "writing" | "polishing" | "ready" | "failed",
  stage?: "storyboard" | "drawing",   // money gate: nothing is drawn in "storyboard"
  script?: ComicScript,
  redraws?, costLog?: CostEntry[],
}
```

## Character Bible
```ts
CastMember {
  id, name, role, importance: "main" | "supporting" | "minor",
  identity?: { face, skin, hair, body, markers[] },   // what never changes; no clothes
  mainStage?: { label, ageRange },                    // e.g. "Startup founder (32)"
  stages?: LifeStage[],                               // only when the story spans years
  wardrobe?: string,                                  // typical clothes by situation
  description,                                        // prose used in prompts (from the approved sheet)
  source: "photos" | "ai", photos[], photoCheck?,
  design?: { file, approved, needsRedraw? }, designAttempts,
}
LifeStage { id, label, ageRange, look, design?, designAttempts }
```
Rules: identity is style-free; design sheets are per style; any change to identity, photos or the main sheet invalidates stage sheets.

## Script
```ts
ComicScript { title, tagline, bible, characters[], cover, pages[] }
cover { scene, design?: { concept, approach, titleFont, titleFill, titleOutline, titlePosition }, options?[] }  // 3 ideas
Page  { layout: LayoutId, panels[] }
Panel { shot, scene, caption, captionPos?, dialogue: DialogueLine[], context?: SceneContext }
DialogueLine { speaker, side, kind: speech|shout|whisper|thought, text, pos? }   // pos = dragged position
SceneContext {
  location, period, timeOfDay, weather, event,
  cast: { name, stage, wardrobe, emotion, action }[],
  objects[], continuity
}
```

## Style recipe
See `research/style-engine.md`. `StyleRecipe { id, label, family, render{…}, direction{…}, cover, avoid[], lettering, lora? }`.

## Cost
```ts
CostEntry { item, usd, at, detail?, usage?: CostUsage[] }
CostUsage { provider, model, operation, inputTokens?, outputTokens?, image?: { size, quality, references }, retries?, usd }
```

## Recreate recipe (designed, not built yet)
The reusable creative format of a comic, with **no private data**:
```ts
RemixPreset {
  id, sourceComicId,            // private link, never shown
  styleId,
  pageCount, panelCount,
  layoutPattern: LayoutId[],    // page-by-page layouts
  pacing: "sparse" | "balanced" | "dense",
  coverApproach,                // e.g. "symbolic"
  coverTitleFont, palette?,     // colour direction from the cover design
  tone,                         // from the story bible's tone, rewritten generically
  genre,
  sampleCoverUrl, samplePageUrls[],   // only if the owner published the comic
}
```
**Never** copied into a preset: names, photos, dialogue, captions, the story, identity, character designs.

## Future tables (Supabase)
`users` · `comics` · `cast_members` · `life_stages` · `pages` · `panels` · `images` (key, file, version, cost) · `cost_entries` · `presets` · `publications` (opt-in Explore listing with consent timestamp).
