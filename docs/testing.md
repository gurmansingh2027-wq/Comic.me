# Testing without spending money

Clicking through the whole flow normally costs money: character designs and panels are drawn by OpenAI. For flow and UI testing, run a second copy of the app that draws grey placeholders and uses its own folder of comics:

```bash
# 1. Make a test copy of your comics (never touches storage/)
mkdir -p .context/test-storage && cp -R storage/comics .context/test-storage/comics

# 2. Start a test server on port 3100
COMICME_STORAGE_DIR=$PWD/.context/test-storage \
COMICME_FAKE_IMAGES=1 \
NEXT_DIST_DIR=.next-test \
npx next dev -p 3100
```

- `COMICME_FAKE_IMAGES=1`: every picture (panels, covers, character designs) is a grey "TEST" placeholder, logged at $0.
- `COMICME_STORAGE_DIR`: where comics and interview logs are read and written.
- `NEXT_DIST_DIR`: a separate build folder, so the test server can run next to the normal one.

Claude calls (finding the cast, writing the storyboard, the dialogue pass, cover ideas) are still real: about $1 for a full storyboard. Run them sparingly.

## What to check by hand
- **Flow:** Characters → "Write my storyboard" lands on step 4 (Storyboard) and stays there while writing. Approving shows the title check, then step 5 draws. The step indicator never goes 5 → 4.
- **Gate:** `POST /api/comics/<id>/images/1-1` returns 409 until the storyboard is approved.
- **Lettering:** drag a balloon or caption on the storyboard and on the finished comic, reload, and it stays put. Editing text never redraws art.
- **Ages:** a story spanning years shows "Name, through the years" with each age; a single-age story shows no age controls.
- **Explore:** `/explore` shows covers, pages and panels of every comic not hidden; hover shows title, style and Recreate.
