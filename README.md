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
| Comic styles (art direction + lettering) | `src/lib/styles.ts`, samples in `public/styles/` |
| Claude writes, then edits, the script (in the background) | `src/lib/engines/story.ts`, `src/lib/pipeline.ts` → `POST /api/comics/[id]` |
| Page layouts | `src/lib/layouts.ts` |
| OpenAI draws the cover and each panel | `src/lib/engines/art.ts` → `POST /api/comics/[id]/images/[key]` |
| Lettering, pages, PDF download | `src/lib/engines/render.ts`, `src/components/ComicViewer.tsx` |
| Saved comics | `storage/comics/<id>/` (local only, not in git) |

Redraw the style sample pictures: `node scripts/make-style-samples.ts --force`
