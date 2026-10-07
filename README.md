# Comic.me

Tell your story out loud, pick a comic style, set up your characters from photos or AI designs, and get a real comic book (cover + pages) you can download as a PDF and print.
See [PRODUCT.md](PRODUCT.md) for the product vision and roadmap.

## Run it on your computer

1. **Add your API keys.** Open the file `.env.local` in this folder (create it by copying `.env.example` if it's missing) and paste your keys after the `=` signs:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   OPENAI_API_KEY=sk-...
   ```
   - Claude key: https://console.anthropic.com/settings/keys
   - OpenAI key: https://platform.openai.com/api-keys

   `.env.local` is never uploaded to GitHub.
2. **Install** (first time only): `npm install`
3. **Start:** `npm run dev`, then open http://localhost:3000
4. **Stop:** press `Ctrl + C` in the terminal.

After changing `.env.local`, stop and start the app again.

## How it works

| Step | Where |
| --- | --- |
| Voice story interview + style picker | `src/app/create/page.tsx`, `src/components/StoryStudio.tsx`, `src/lib/engines/interview.ts`, `src/lib/engines/voice.ts` |
| Characters: cast, photos, designs, approval | `src/app/comic/[id]/characters/page.tsx`, `src/components/CharacterStudio.tsx`, `src/lib/cast-service.ts`, `src/lib/engines/characters.ts` |
| Style recipes (how each style draws AND directs the story) | `src/lib/styles.ts`, samples in `public/styles/` |
| Comic Director writes the script with scene context, editor polishes it, art director proposes 3 covers (in the background) | `src/lib/engines/story.ts`, `src/lib/engines/cover.ts`, `src/lib/pipeline.ts` → `POST /api/comics/[id]` |
| Storyboard: edit pages, panels, dialogue; drag bubbles | `src/app/comic/[id]/storyboard/page.tsx`, `src/components/StoryboardEditor.tsx`, `src/components/WireframePage.tsx`, `src/lib/script-edits.ts` |
| Page layouts | `src/lib/layouts.ts` |
| OpenAI draws the cover and each panel | `src/lib/engines/art.ts` → `POST /api/comics/[id]/images/[key]` |
| Lettering, pages, PDF download, bubble editing and panel redraws | `src/lib/engines/render.ts`, `src/components/ComicViewer.tsx`, `src/components/ComicPageEditor.tsx` |
| Measured cost log per comic | `src/lib/meter.ts`, `src/lib/costs.ts`; report: `node scripts/cost-report.ts --detail` |
| Saved comics | `storage/comics/<id>/` (local only, not in git) |

Redraw the style sample pictures: `node scripts/make-style-samples.ts --force`
