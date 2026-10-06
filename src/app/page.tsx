import StoryForm from "@/components/StoryForm";

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="text-center">
        <h1 className="font-title text-5xl leading-tight tracking-wide sm:text-7xl">
          Your story. <span className="text-zap">As a comic.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg">
          Tell us about your life, your love story, your career — anything. Pick a style, and we&apos;ll write
          and draw it as a real comic book, with a cover and full pages, ready to download and print.
        </p>
      </section>
      <StoryForm />
    </div>
  );
}
