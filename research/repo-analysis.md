# Open-source repositories: what to take, what to skip

> Licences, stars and last activity checked on GitHub on 2026-10-08. "Concept only" means: learn from the idea, don't copy code.
> Comic.me is API-first today, so most of these matter as **ideas** or for a **later self-hosted stage**, not as code to import.

## Verdicts at a glance

| Repo | What it does | Licence · status | Verdict for Comic.me |
|---|---|---|---|
| jbilcke-hf/ai-comic-factory | LLM writes panels, SDXL draws; layouts in TS | Apache-2.0 · **archived** | Concept only. We already exceed it (director, bible, lettering, storyboard). Its prompt-per-panel approach is what we moved away from. |
| AskAillex/comic-maker | Local LLM script → cast sheets → per-character seeds → bubbles, SFX, CBZ export | MIT · new, 0★ | **Borrow ideas:** SFX lettering, CBZ export. Per-character seeds are superseded by reference images. |
| vayoa/castadi | Text file → panels + bubbles | **No licence** · stale since 2023 | Skip (can't reuse; outdated). |
| HVision-NKU/StoryDiffusion | Training-free consistent self-attention across a batch | Apache-2.0 · inactive since 2024 | Superseded for us by multi-reference models; the idea of generating related panels *together* is worth revisiting if self-hosting. |
| byliutao/1Prompt1Story | Consistency from a single prompt context | MIT | Research interest; superseded by references. |
| tencent-ailab/IP-Adapter | Feed a reference image (identity/style) into diffusion | Apache-2.0 · inactive | Self-hosting stage only (SDXL/FLUX.1). Today's API models do this natively. |
| ToTheBeginning/PuLID | Strong face-identity adapter | Apache-2.0 | Self-hosting stage: best open option for photo → face identity on FLUX. |
| instantX-research/InstantID | Face identity + pose | Apache-2.0 · inactive | Superseded by PuLID / native references. |
| TencentARC/PhotoMaker | Stacked-ID from several photos | Unclear (NOASSERTION) | Skip: licence unclear. |
| FireRedTeam/StoryMaker | Face + clothing + body consistency | **No licence** | Concept only (it separates face from clothes, as our Character Bible does). |
| jianzongwu/DiffSensei | Manga generation with character control | **No licence**, needs ~24 GB GPU | Concept only; watch for a licensed release. |
| instantX-research/InstantStyle | Style from one reference image | **No licence** | Concept only. We already pass the style sample as a reference. |
| google/style-aligned | Shared-attention style consistency | Apache-2.0 · archived | Superseded. |
| lllyasviel/ControlNet | Pose/depth/lineart control | Apache-2.0 | Self-hosting stage: pose/depth control for exact compositions. Concept now (we describe shots in text). |
| Mukosame/Anime2Sketch | Image → clean line art | MIT · active | **Useful** for the Ink style later (line extraction) and for building storyboard thumbnails. |
| comfyanonymous/ComfyUI | Node workflows + API | **GPL-3.0** · very active | Use as a *separate service* if we self-host; never copy code into the app. |
| ostris/ai-toolkit | LoRA training (FLUX, Qwen…) with a UI | MIT · active | **Recommended trainer** if we train ourselves; fal.ai's hosted trainers are the no-GPU equivalent. |
| kohya-ss/sd-scripts | Standard LoRA scripts | Apache-2.0 · active | Fine alternative; more manual. |
| kohya-ss/musubi-tuner | Video/image model tuning | **No licence** | Use as a tool only. |
| bghira/SimpleTuner, Nerogar/OneTrainer | Trainers | **AGPL-3.0** | Use as tools only; don't embed. |
| huggingface/diffusers | Reference pipelines + training scripts | Apache-2.0 · active | Foundation if we ever self-host inference. |
| XLabs-AI/x-flux | FLUX.1 LoRA/ControlNet | Apache-2.0 · inactive | Superseded by FLUX.2 tooling. |
| ragavsachdeva/magi | Detects panels, characters, text on comic pages | **No licence** | Tool for dataset prep only (crop panels); check terms. |
| fpgaminer/joycaption | Auto-captions images for training | Apache-2.0 · active | **Use** for captioning style datasets. |
| miyyer/comics (COMICS dataset) | ~1.2M Golden Age panels | MIT code; images are old comics | Research/benchmarks only; check rights before training. |
| manga109/public-annotations | Manga109 annotations | CC-BY-4.0 annotations; images under Manga109's own academic terms | Research only; **not** for commercial training. |
| Pepper & Carrot (David Revoy) | Open webcomic | **CC-BY-4.0** art | **Legally usable** to prototype a style LoRA and test the pipeline, with attribution. |

## Patterns worth adopting (and where they live in Comic.me)
1. **Cast sheets as identity anchors** (comic-maker, StoryMaker). Done: Character Bible + design sheets per life stage.
2. **Separate identity from clothing** (StoryMaker). Done: identity vs wardrobe, wardrobe chosen per scene by the Comic Director.
3. **Lettering outside the image** (all serious systems). Done: canvas renderer, editable balloons.
4. **SFX lettering** (comic-maker). Next: an SFX field per panel rendered in code (BLAM, CRACK…), styled per style recipe.
5. **Exports: CBZ / web reader** (comic-maker). Next: CBZ alongside PDF (cheap to add).
6. **Pose/depth control** (ControlNet). Later: for exact compositions once self-hosting or when an API exposes pose control.
7. **Trainable house styles** (ai-toolkit + FLUX.2/Qwen). Next: see `research/style-engine.md` and `docs/comicme-training-strategy.md`.

## Patterns to avoid
- **Per-panel prompts that re-describe everything** (ai-comic-factory). They drift: characters change faces and outfits. We now build prompts from structured scene context.
- **Seeds as the consistency mechanism.** Fragile and model-specific; references beat seeds.
- **Training on scraped commercial comics.** Legal risk for a consumer product. Train only on licensed, commissioned or CC-BY art.
