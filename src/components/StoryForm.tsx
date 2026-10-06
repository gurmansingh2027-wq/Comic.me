"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_STORY_LENGTH, MIN_STORY_LENGTH } from "@/lib/comic";
import { COMIC_STYLES, styleSampleUrl } from "@/lib/styles";

const STARTERS = [
  {
    label: "💑 Couple journey",
    text: `Priya and Arjun met in 2016 at Mood Indigo, the college fest in Pune, when they both reached for the last samosa at the food stall. Priya was a shy architecture student with paint on her sleeves; Arjun was the loud engineering guy running the quiz. They argued about who touched it first, laughed, and split it.

They became best friends that year, sitting on the hostel steps every night talking about everything. In 2019 Arjun got a job in Toronto and Priya stayed in Bangalore. For three years they lived on video calls across a 10.5-hour time difference: she'd wake up at 6am to catch his evening, he'd stay up past 2am for hers. They watched movies "together", ate the same dinners on screen, and nearly broke up once in the winter of 2021 when it all felt too far.

In 2022 Arjun flew back without telling her. He asked her to meet him at the old fest ground in Pune. It was pouring with rain. He handed her a samosa box. Inside was a ring. She said yes before he could finish the question.

They got married last December in Jaipur, with both families dancing until 3am. At the reception, the dessert table had one single samosa on a silver plate. They split it.`,
  },
  {
    label: "💼 CV story",
    text: `I'm Sam. At 19 I dropped out of college and took a job as a cashier at Chapter One, a tiny second-hand bookshop in Leeds. The owner, an old man called Mr. Okafor, let me read anything on the shelves during quiet hours. I found a battered book on web programming and taught myself to code on my lunch breaks, writing HTML on receipt paper.

When the shop was close to shutting down in 2017, I built it a website and an online catalogue on weekends. Online orders saved the shop. A customer who ran a small startup saw the site and offered me a job as a junior developer.

I was terrified and sure everyone would find out I had no degree. I worked late, broke production twice, and learned from the most patient senior engineer, Lena. Three years later I was leading a team of six engineers building payment software used by thousands of small shops.

I still have the first book I ever sold at Chapter One on my desk. Last month I hired my first junior developer: a 20-year-old who taught herself to code. I told her about the receipt paper.`,
  },
  {
    label: "🌱 Life story",
    text: `My grandmother Rosa grew up on a tiny lemon farm near Palermo, Sicily, the youngest of seven. In 1958, at 19, she crossed the ocean alone on a ship to New York with one suitcase and a jar of her mother's tomato seeds sewn into the lining of her coat.

She didn't speak English. She worked nights at a garment factory and practised words from newspapers in the morning. She met my grandfather Sal at a church dance; he stepped on her feet all night, and she married him anyway.

In 1965 they opened a little bakery in Brooklyn, Rosa's, with a hand-painted sign. They raised four kids in the apartment above it, and the whole street came for her Sunday cannoli. When a fire damaged the bakery in 1977, the neighbours showed up with buckets of paint and rebuilt it with them in three weeks.

Rosa is 86 now. The bakery is run by my aunt. Every summer Rosa still plants tomatoes in the backyard with her grandchildren, from seeds saved year after year from that first jar.`,
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
          placeholder="Who's in it? Where and when does it happen? What were the big moments, the funny bits, the turning points? The more real details you share, the richer (and longer) your comic."
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
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {COMIC_STYLES.map((style) => {
            const selected = style.id === styleId;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => setStyleId(style.id)}
                aria-pressed={selected}
                className={`overflow-hidden rounded border-3 text-left transition ${
                  selected ? "border-ink bg-pop shadow-[4px_4px_0_#111]" : "border-neutral-300 bg-paper hover:border-ink"
                }`}
              >
                <Image
                  src={styleSampleUrl(style.id)}
                  alt={`${style.label} style example`}
                  width={512}
                  height={512}
                  className="aspect-square w-full border-b-3 border-inherit bg-neutral-200 object-cover"
                />
                <div className="p-3">
                  <div className="text-lg font-bold">{style.label}</div>
                  <div className="text-sm text-neutral-700">{style.blurb}</div>
                </div>
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
          {submitting ? "Starting…" : "Make my comic!"}
        </button>
        {submitting && (
          <p className="mt-3 text-sm text-neutral-700">
            Saving your story…
          </p>
        )}
      </div>
    </form>
  );
}
