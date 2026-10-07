# Explore and Recreate

> Growth loop: **discover → see something cool → Recreate → add your story → builder opens with the preset applied.**
> Every good Comic.me creation can become a template, without exposing anyone's private story.

## Explore page (`/explore`)
- **Visual first:** a large masonry wall of covers, dramatic single pages and striking panel strips. Minimal text by default.
- **On hover:** title, style and a short line of context (only what the owner published), plus a **Recreate** button.
- **On click:** a richer view with the cover, a few pages, the style, the page count and the cover approach, then a big **Recreate** button.
- **Not now:** followers, comments, likes, creator profiles, moderation tooling.

## What "Recreate" copies (the remix preset)
Copied: style · page count · page-by-page layout pattern · pacing · cover approach and title typography · colour direction · tone and genre · rendering presets.
**Never copied:** names, photos, dialogue, captions, story text, character designs or identity.

Flow: Recreate → `/create?preset=<id>` → "What's your story?" interview (style pre-selected; the Comic Director is told "use this page structure and pacing as a template") → the normal flow continues.

## Privacy and consent
- Comics are **private by default**. Publishing to Explore is an explicit opt-in per comic, with a consent note when real people's photos were used.
- Explore shows rendered art only; never uploaded photos or design sheets.
- An unpublish button removes the comic from Explore immediately.
- Later: report button + moderation review before a comic is featured.

## Prototype scope (this PR)
See the Explore PR:
- an `explore` opt-in flag on comics
- a `/explore` masonry page built from published comics' covers and pages
- a derived `recipe` (no private data)
- a **Recreate** button that starts `/create` with the style and structure preset

No accounts, no social features.
