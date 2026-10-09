# Testing without spending money

Clicking through the whole flow normally costs money: character designs and panels are drawn by OpenAI. For flow and UI testing, run a second copy of the app that draws grey placeholders and uses its own folder of comics:

```bash
# 1. Make a test copy of your comics (never touches storage/)
mkdir -p .context/test-storage && cp -R storage/comics .context/test-storage/comics

# 2. Start a test server on port 3100
COMICME_STORAGE_DIR=$PWD/.context/test-storage \
COMICME_FAKE_IMAGES=1 \
COMICME_FAKE_QA=1 \
NEXT_DIST_DIR=.next-test \
npx next dev -p 3100
```

- `COMICME_FAKE_IMAGES=1`: every picture (panels, covers, character designs, canon object sheets) is a grey "TEST" placeholder, logged at $0.
- `COMICME_FAKE_QA=1`: every visual continuity check (picture, page, final) passes instantly at $0. It only works together with `COMICME_FAKE_IMAGES=1` and `COMICME_STORAGE_DIR`, and never in a production build, so real comics are always really checked.
- `COMICME_STORAGE_DIR`: where comics and interview logs are read and written.
- `NEXT_DIST_DIR`: a separate build folder, so the test server can run next to the normal one.

Claude calls (finding the cast, writing the storyboard, the dialogue pass, cover ideas) are still real: about $1 for a full storyboard. Run them sparingly.

## What to check by hand
- **Flow:** Characters → "Write my storyboard" lands on step 4 (Storyboard) and stays there while writing. Approving shows the title check, then step 5 draws. The step indicator never goes 5 → 4.
- **Gate:** `POST /api/comics/<id>/images/1-1` returns 409 until the storyboard is approved. Approval itself is refused (with the reason) while a main/supporting design, a life-stage design or an important object's canon sheet is unapproved, or while the Continuity Ledger finds a hard problem (e.g. an unknown object id, a direction flip inside an action sequence).
- **Important things:** a story with a recurring car or object shows an "Important things" section on Characters; "Write my storyboard" stays disabled until its design is approved.
- **Look policies:** switch a character to "Ask me for big changes"; a proposed look change on the storyboard shows "Use this change" / "Keep approved look".
- **Continuity checks:** on the finished comic, dependent panels draw after their predecessor; when every picture is in, "Checking continuity and page readability…" runs, then "Continuity checks complete." and the PDF button becomes enabled. `GET /api/comics/<id>/qa` reports `ready: true` only then; `POST /api/comics/<id>/explore` with `published: true` returns 409 before that.
- **Lettering:** drag a balloon or caption on the storyboard and on the finished comic, reload, and it stays put. Editing text never redraws art.
- **Ages:** a story spanning years shows "Name, through the years" with each age; a single-age story shows no age controls.
- **Explore:** `/explore` shows covers, pages and panels of every comic not hidden; hover shows title, style and Recreate.

## Measuring the visual inspector (paid, capped at $1)

`research/fixtures/corners-failures.json` labels pictures of a real comic (kept in local storage, not in the repo) with the continuity failure each one shows. To see what the inspector catches:

```bash
COMICME_DEV_TOOLS=1 npx next dev          # the dev tool is hidden unless this is set
node scripts/qa-eval.ts --only 7-3,4-6,3-4 --effort low
```

Each check costs about $0.02–0.04 (Claude vision); nothing is drawn. Every request reserves its maximum estimated cost first and the tool stops at $1 in total (`src/lib/qa/budget.ts`). Results so far are in `research/corners-are-for-winning-failure-analysis.md`.

## Before changing what Claude is asked to return

Every structured answer from Claude (the storyboard, the dialogue pass, the visual checks) is defined by a schema in code. Claude compiles each schema into a grammar with a hard size limit; past it, every call fails with "The compiled grammar is too large" and the app shows "our request to Claude was rejected". The storyboard schema sits close to that limit. After editing any schema, run:

```bash
set -a; source .env.local; set +a
npm run probe-schemas
```

It sends a one-token request per schema (free when rejected, about a cent when accepted) and fails loudly if one no longer compiles. The free tests can't catch this, because only Claude knows the limit.
