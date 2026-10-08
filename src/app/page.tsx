import Image from "next/image";
import Link from "next/link";
import ExploreWall from "@/components/ExploreWall";
import { exploreWall } from "@/lib/explore";
import { COMIC_STYLES, styleSampleUrl } from "@/lib/styles";

export const dynamic = "force-dynamic";

const HOW_IT_WORKS = [
  { emoji: "🎙️", title: "Talk", text: "Tell us what happened. We'll ask about the good bits." },
  { emoji: "🎨", title: "Pick a look", text: "Blockbuster, absurd sci-fi, hand-inked, manga and more. Each one tells the story differently." },
  { emoji: "🧑‍🎨", title: "Meet your cast", text: "A few photos, or let us imagine them. Approve each look once." },
  { emoji: "✏️", title: "Fix it cheap", text: "Shuffle panels, rewrite lines, cut pages. All before a single picture is drawn." },
  { emoji: "📖", title: "Get the book", text: "A designed cover and real pages, ready to download and print." },
];

export default async function Home() {
  const { tiles } = await exploreWall();
  return (
    <div className="space-y-14">
      <section className="space-y-6 text-center">
        <h1 className="font-title text-5xl leading-tight tracking-wide sm:text-7xl">
          Your story. <span className="text-zap">As a comic.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg">
          Your love story, your career, your family&apos;s legend. Tell it out loud and we&apos;ll direct it, draw it and letter it like a real
          comic book. You just approve the good bits.
        </p>
        <Link
          href="/create"
          className="comic-box inline-block bg-zap px-10 py-4 font-title text-3xl tracking-wide text-white transition hover:-translate-y-0.5"
        >
          🎙️ Tell me your story
        </Link>
      </section>

      {tiles.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="font-title text-3xl tracking-wide">Made from real stories</h2>
            <Link href="/explore" className="text-sm font-bold underline">
              See the whole wall →
            </Link>
          </div>
          <div className="relative max-h-[560px] overflow-hidden rounded-lg bg-[#0b0b0b] p-1.5">
            <ExploreWall tiles={tiles.slice(0, 18)} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0b0b0b] to-transparent" />
          </div>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {HOW_IT_WORKS.map((step, i) => (
          <div key={step.title} className="comic-box space-y-2 bg-white p-5">
            <div className="text-3xl">{step.emoji}</div>
            <h2 className="font-title text-2xl tracking-wide">
              {i + 1}. {step.title}
            </h2>
            <p className="text-neutral-700">{step.text}</p>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-center font-title text-4xl tracking-wide">{COMIC_STYLES.length} ways to tell it</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {COMIC_STYLES.map((style) => (
            <figure key={style.id} className="space-y-1 text-center">
              <Image
                src={styleSampleUrl(style.id)}
                alt={`${style.label} style example`}
                width={256}
                height={256}
                className="comic-box aspect-square w-full object-cover"
              />
              <figcaption className="text-sm font-bold">{style.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
