# ACTION REQUIRED FROM GURMAN

## 1. Top up OpenAI credit (needed now; blocks all drawing)
- **Why:** OpenAI returns `insufficient_quota` ("You have no credits remaining") for the key in `.env.local`. Character designs, covers and panels can't be drawn until this is fixed.
- **Do:** platform.openai.com → Settings → **Billing** → add credit (e.g. $20). Make sure it's the **same organisation/project** as the API key in `.env.local`. If you added money before and it isn't showing, it probably went to a different organisation.
- **Cost guide:** about $3–4.50 per finished 10-page comic. The benchmark pilot needs about $2 of OpenAI credit.

## 2. Create a fal.ai account and give Comic.me a FAL_KEY (needed for the model benchmark, not for today's app)
- **Provider:** fal.ai. **One** account covers every challenger: Nano Banana 2/Pro, Seedream 5, FLUX.2 (pro/dev + LoRA) and Qwen-Image, plus the hosted LoRA trainers. **Replicate is not needed**: it offers nothing we need that fal lacks.
- **Do:**
  1. Sign up at fal.ai.
  2. Go to Dashboard → **Keys** → create a key.
  3. Add credit (about $15 is plenty for the pilot and a first full run).
  4. Paste the key into `.env.local` on a new line: `FAL_KEY=your-key-here`, then restart the app.
- **Used by:** the image-model benchmark (`docs/comicme-benchmark.md`): pilot about $6–8, full run on the top models about $30–50. Later, a style LoRA training test costs about $2–7 per run.
- **MVP or training?** **Benchmark first.** If a fal model wins, it becomes part of the MVP. Training (LoRAs) comes after.
- **Until then:** the app keeps running on OpenAI alone; nothing breaks without `FAL_KEY`.

## 3. Optional, no money: GitHub Student Pack
Check for free credits you can claim later: DigitalOcean / Azure (GPU hosting), Sentry (error tracking), Doppler (secrets), domain names. Not needed now.
