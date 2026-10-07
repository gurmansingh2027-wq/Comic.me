# Character consistency: approaches and Comic.me's choice

## The problem
The same person must be recognisable in panel 1 and panel 40, across **ages, outfits, poses, angles and art styles**, with up to 4 people per panel, and sometimes from **real photos**.

## Approaches (2026)

| Approach | How it works | Strengths | Weaknesses | Fit |
|---|---|---|---|---|
| **Reference-conditioned generation/editing** (GPT Image 2/2.5, Nano Banana 2/Pro, Seedream 5, FLUX.2, Qwen-Image-Edit) | Pass design sheets and/or photos with every panel | No training; works through an API; multi-character; instant | Identity can drift on hard angles; costs per reference | **Core approach (in use)** |
| Per-character LoRA | Fine-tune a small adapter per person | Strongest identity on open models | Training time + cost per person; open models only | Premium/series later |
| Identity adapters (PuLID, InstantID, IP-Adapter, PhotoMaker) | Inject face embeddings into diffusion | Strong faces from photos | Self-hosted GPU; faces only (not body/outfit) | Self-hosting stage |
| Training-free shared attention (StoryDiffusion, 1Prompt1Story) | Generate related images jointly | No training | Self-hosted; batch-bound; weaker than references | Research interest |
| Seeds | Re-use a random seed | Free | Breaks with any prompt change | Avoid |

## Comic.me's system (implemented in this repo)
1. **Character Bible** (`CastMember`): identity (face, skin, hair, build, markers) **separate from wardrobe**, the main age, and **life stages** only when the story spans years.
2. **Design sheets per life stage.** The main sheet is drawn from photos (or a description) + the style sample. Other ages are drawn **from the approved main sheet** (identity anchor) + photos, so a child and an adult share features. Each sheet must be approved.
3. **Sheets define who, not what they wear.** Sheets show a simple everyday outfit; the Comic Director picks a **wardrobe per scene** (school uniform, sherwani, jersey…).
4. **Scene context per panel:** each person's life stage, wardrobe, emotion and action, plus location, period, time, weather, props and continuity.
5. **Panel prompt** = setting + for each person: "reference image N is their design (at this age); copy face, features, skin, hair, build, markers, **not the outfit**; in this panel they wear …" + neighbouring-panel notes + style recipe.
6. **Approved descriptions.** After approval, Claude describes each sheet precisely (person first, then the sheet's outfit separately), so text and picture agree.

## Known limits and next steps
- **More than 4 people in a panel:** we send at most 4 references (main characters first). Nano Banana 2 claims "5-person consistency"; benchmark it.
- **Extreme angles / back views:** identity can drift. Add back and profile views to sheets (a turnaround sheet) if the benchmark shows drift.
- **Automatic QA (next):** after each panel, a vision check (Claude) compares faces against the sheets and the scene context (right people, right count, right age, right clothes, style held). It redraws once automatically if it fails, and logs the retry cost. See `docs/comicme-generation-pipeline.md`.
- **Photos of real people:** keep explicit consent copy in the UI, store photos privately, and never show them on Explore.
