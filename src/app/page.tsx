import Image from "next/image";
import Link from "next/link";
import { COMIC_STYLES, styleSampleUrl } from "@/lib/styles";

const HOW_IT_WORKS = [
  { emoji: "🎙️", title: "Tell us your story", text: "Just talk. Our storyteller listens and asks a few questions." },
  { emoji: "🎨", title: "Pick a style", text: "Superhero, manga, watercolour, desi classic and more." },
  { emoji: "🧑‍🎨", title: "Meet your characters", text: "Upload photos or let AI design them, then approve each look." },
  { emoji: "📖", title: "Get your comic book", text: "A cover and full pages, ready to download and print." },
];

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="space-y-6 text-center">
        <h1 className="font-title text-5xl leading-tight tracking-wide sm:text-7xl">
          Your story. <span className="text-zap">As a comic.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg">
          Your love story, your career, your family&apos;s legend: tell it out loud, and we&apos;ll write and draw it as a real
          comic book, ready to download and print.
        </p>
        <Link
          href="/create"
          className="comic-box inline-block bg-zap px-10 py-4 font-title text-3xl tracking-wide text-white transition hover:-translate-y-0.5"
        >
          🎙️ Start your story
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <h2 className="text-center font-title text-4xl tracking-wide">{COMIC_STYLES.length} styles to choose from</h2>
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
