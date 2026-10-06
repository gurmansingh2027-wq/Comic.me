"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_STORY_LENGTH, MIN_STORY_LENGTH } from "@/lib/comic";
import { COMIC_STYLES } from "@/lib/styles";

const STARTERS = [
  {
    label: "💑 Couple journey",
    text: "Priya and Arjun met in 2016 when they both reached for the last samosa at a college fest in Pune. They argued, laughed, and split it. Years of long-distance calls between Bangalore and Toronto followed. Arjun proposed on a rainy evening at the same fest ground, with a samosa box hiding the ring. They got married last December.",
  },
  {
    label: "💼 CV story",
    text: "I'm Sam. I started as a cashier at a bookshop, where I taught myself to code on my lunch breaks. I built the shop's first website, then got hired as a junior developer at a small startup. Three years later I'm leading a team of six engineers, and I still keep a copy of the first book I ever sold on my desk.",
  },
  {
    label: "🌱 Life story",
    text: "My grandmother Rosa grew up on a tiny farm in Sicily. At 19 she crossed the ocean alone on a ship to New York with one suitcase and a jar of her mother's tomato seeds. She opened a little bakery in Brooklyn, raised four kids above it, and every summer she still plants those same tomatoes in the backyard with her grandchildren.",
  },
];

export default function StoryForm() {
  const router = useRouter();
  const [story, setStory] = useState("");
  const [styleId, setStyleId] = useState(COMIC_STYLES[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const length = story.trim().length;
  const canSubmit = length >= MIN_STORY_LENGTH && length <= MAX_STORY_LENGTH && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/comics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story, styleId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Something went wrong.");
      router.push(`/comic/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="comic-box space-y-3 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-title text-3xl tracking-wide">1. Tell your story</h2>
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((starter) => (
              <button
                key={starter.label}
                type="button"
                onClick={() => setStory(starter.text)}
                className="rounded-full border-2 border-ink bg-paper px-3 py-1 text-sm font-bold hover:bg-pop"
              >
                {starter.label}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={story}
          onChange={(event) => setStory(event.target.value)}
          rows={8}
          maxLength={MAX_STORY_LENGTH}
          placeholder="Who's in it? Where does it happen? What were the big moments? The more real details, the better your comic."
          className="w-full resize-y rounded border-2 border-ink p-3 text-lg focus:ring-4 focus:ring-pop focus:outline-none"
        />
        <p className="text-right text-sm text-neutral-600">
          {length < MIN_STORY_LENGTH
            ? `${MIN_STORY_LENGTH - length} more characters to go`
            : `${length} / ${MAX_STORY_LENGTH}`}
        </p>
      </section>

      <section className="comic-box space-y-4 bg-white p-5">
        <h2 className="font-title text-3xl tracking-wide">2. Pick a style</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {COMIC_STYLES.map((style) => {
            const selected = style.id === styleId;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => setStyleId(style.id)}
                aria-pressed={selected}
                className={`rounded border-3 p-4 text-left transition ${
                  selected ? "border-ink bg-pop shadow-[4px_4px_0_#111]" : "border-neutral-300 bg-paper hover:border-ink"
                }`}
              >
                <div className="text-3xl">{style.emoji}</div>
                <div className="mt-1 text-lg font-bold">{style.label}</div>
                <div className="text-sm text-neutral-700">{style.blurb}</div>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded border-2 border-zap bg-red-50 p-3 font-bold text-zap">
          {error}
        </p>
      )}

      <div className="text-center">
        <button
          type="submit"
          disabled={!canSubmit}
          className="comic-box bg-zap px-10 py-4 font-title text-3xl tracking-wide text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {submitting ? "Writing your comic…" : "Make my comic!"}
        </button>
        {submitting && (
          <p className="mt-3 text-sm text-neutral-700">
            Our AI writer is turning your story into a script. This takes about 20–60 seconds.
          </p>
        )}
      </div>
    </form>
  );
}
