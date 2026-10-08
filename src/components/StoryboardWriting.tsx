"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ComicStatus } from "@/lib/comic";
import { COPY } from "@/lib/copy";
import Countdown, { ESTIMATES } from "./Countdown";
import Stepper from "./Stepper";

const POLL_MS = 3000;

/**
 * The Storyboard step while the script is being written. Polls the comic and, once the
 * storyboard is ready, reloads the page so the editor appears. It never starts drawing.
 */
export default function StoryboardWriting({ comicId, initialStatus, initialError, initialSince }: { comicId: string; initialStatus: ComicStatus; initialError?: string; initialSince: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState(initialError);
  const [since, setSince] = useState(() => Date.parse(initialSince));

  useEffect(() => {
    if (status !== "writing" && status !== "polishing") return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/comics/${comicId}`, { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      const data = await response.json();
      if (data.status === "ready") {
        clearInterval(timer);
        router.refresh();
        return;
      }
      setStatus(data.status);
      setError(data.error);
      if (data.since) setSince(Date.parse(data.since));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [comicId, status, router]);

  async function retry() {
    setStatus("writing");
    setError(undefined);
    setSince(Date.now());
    await fetch(`/api/comics/${comicId}`, { method: "POST" });
  }

  // While writing, the polish pass is still to come; while polishing, only its own time is left.
  const estimate = status === "polishing" ? ESTIMATES.polishScript : ESTIMATES.writeScript + ESTIMATES.polishScript;
  const steps = [
    { label: COPY.writing.steps.reading, done: true, active: false },
    { label: COPY.writing.steps.directing, done: status === "polishing", active: status === "writing" },
    { label: COPY.writing.steps.polishing, done: false, active: status === "polishing" },
    { label: COPY.writing.steps.review, done: false, active: false },
  ];

  return (
    <div className="space-y-8">
      <Stepper current="Storyboard" />
      {status === "failed" ? (
        <div className="comic-box mx-auto max-w-xl space-y-4 bg-white p-8 text-center">
          <h1 className="font-title text-4xl tracking-wide text-zap">{COPY.writing.stuckTitle}</h1>
          <p>{error ?? COPY.writing.stuckFallback}</p>
          <div className="flex justify-center gap-3">
            <button type="button" onClick={retry} className="comic-box bg-pop px-6 py-2 font-title text-2xl tracking-wide">
              Try again
            </button>
            <Link href="/" className="comic-box bg-white px-6 py-2 font-title text-2xl tracking-wide">
              Start over
            </Link>
          </div>
        </div>
      ) : (
        <div className="comic-box mx-auto max-w-xl space-y-5 bg-white p-8">
          <h1 className="text-center font-title text-4xl tracking-wide">{COPY.writing.title}</h1>
          <ol className="space-y-3">
            {steps.map((step) => (
              <li key={step.label} className={`flex items-center gap-3 text-lg ${step.done || step.active ? "" : "text-neutral-400"}`}>
                <span className="flex h-7 w-7 items-center justify-center">
                  {step.done ? "✅" : step.active ? <span className="h-6 w-6 animate-spin rounded-full border-3 border-ink border-t-pop" /> : "⬜"}
                </span>
                {step.label}
              </li>
            ))}
          </ol>
          <p className="rounded border-2 border-ink bg-pop p-3 text-center text-lg font-bold">
            ⏱ <Countdown key={`${status}-${since}`} startedAt={since} seconds={estimate} />
          </p>
          <p className="text-center text-sm text-neutral-600">{COPY.writing.note}</p>
        </div>
      )}
    </div>
  );
}
