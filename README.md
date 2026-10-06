# Comic.me

Type your story, pick a comic style, and get a 6-panel comic you can download.
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
| Story form | `src/app/page.tsx`, `src/components/StoryForm.tsx` |
| Claude writes the script | `src/lib/engines/story.ts` → `POST /api/comics` |
| OpenAI draws each panel | `src/lib/engines/art.ts` → `POST /api/comics/[id]/panels/[n]` |
| Bubbles, captions, download | `src/lib/engines/render.ts`, `src/components/ComicViewer.tsx` |
| Comic styles | `src/lib/styles.ts` |
| Saved comics | `storage/comics/<id>/` (local only, not in git) |
