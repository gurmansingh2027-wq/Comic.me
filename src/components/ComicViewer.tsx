"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countPanels, imageKeys, imageUrl, panelKey, type ComicScript, type ComicStatus } from "@/lib/comic";
import { downloadComicPdf, downloadPagePng, loadImage, renderFullPage } from "@/lib/engines/render";
import { renderFonts } from "@/lib/fonts";
import { getStyle } from "@/lib/styles";
import ComicPageCanvas, { type ImageStatus } from "./ComicPageCanvas";
import Countdown, { ESTIMATES, formatDuration } from "./Countdown";

/**
 * How many pictures are drawn at the same time. Kept low because new OpenAI accounts
 * may only draw 5 images per minute; the server waits and retries when it hits that limit.
 */
const CONCURRENCY = 3;
const POLL_MS = 3000;

type Props = {
  comicId: string;
  styleId: string;
  initialStatus: ComicStatus;
  initialError?: string;
  /** When the current writing stage started (ISO time). */
  initialSince?: string;
  initialScript?: ComicScript;
  alreadyDrawn: string[];
};

export default function ComicViewer({ comicId, styleId, initialStatus, initialError, initialSince, initialScript, alreadyDrawn }: Props) {
  const style = getStyle(styleId)!;
  const [status, setStatus] = useState<ComicStatus>(initialStatus);
  const [error, setError] = useState(initialError);
  const [script, setScript] = useState(initialScript);
  const [since, setSince] = useState(() => (initialSince ? Date.parse(initialSince) : Date.now()));

  // --- Step 1: wait for the script to be written --------------------------------------------
  useEffect(() => {
    if (status !== "writing" && status !== "polishing") return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/comics/${comicId}`).catch(() => null);
      if (!response?.ok) return;
      const data = await response.json();
      setStatus(data.status);
      setError(data.error);
      if (data.since) setSince(Date.parse(data.since));
      if (data.script) setScript(data.script);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [comicId, status]);

  async function retryWriting() {
    setStatus("writing");
    setError(undefined);
    setSince(Date.now());
    await fetch(`/api/comics/${comicId}`, { method: "POST" });
  }

  if (status !== "ready" || !script) {
    return <WritingProgress status={status} error={error} since={since} onRetry={retryWriting} />;
  }
  return <ComicDrawing comicId={comicId} script={script} style={style} alreadyDrawn={alreadyDrawn} />;
}

function WritingProgress({ status, error, since, onRetry }: { status: ComicStatus; error?: string; since: number; onRetry: () => void }) {
  // While writing, the polish pass is still to come; while polishing, only its own time is left.
  const estimate = status === "polishing" ? ESTIMATES.polishScript : ESTIMATES.writeScript + ESTIMATES.polishScript;

  if (status === "failed") {
    return (
      <div className="comic-box mx-auto max-w-xl space-y-4 bg-white p-8 text-center">
        <h1 className="font-title text-4xl tracking-wide text-zap">Our writer got stuck</h1>
        <p>{error ?? "Something went wrong while writing your comic."}</p>
        <div className="flex justify-center gap-3">
          <button type="button" onClick={onRetry} className="comic-box bg-pop px-6 py-2 font-title text-2xl tracking-wide">
            Try again
          </button>
          <Link href="/" className="comic-box bg-white px-6 py-2 font-title text-2xl tracking-wide">
            Start over
          </Link>
        </div>
      </div>
    );
  }

  const steps = [
    { label: "Reading your story", done: true },
    { label: "Planning the pages and writing every panel", done: status === "polishing", active: status === "writing" },
    { label: "Editor polishing the dialogue", done: false, active: status === "polishing" },
    { label: "Drawing the cover and panels", done: false },
  ];
  return (
    <div className="comic-box mx-auto max-w-xl space-y-5 bg-white p-8">
      <h1 className="text-center font-title text-4xl tracking-wide">Writing your comic…</h1>
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
      <p className="text-center text-sm text-neutral-600">
        You can leave this page open, or come back to this link later.
      </p>
    </div>
  );
}

// --- Step 2: draw every picture, a few at a time ----------------------------------------------

function ComicDrawing({
  comicId,
  script,
  style,
  alreadyDrawn,
}: {
  comicId: string;
  script: ComicScript;
  style: NonNullable<ReturnType<typeof getStyle>>;
  alreadyDrawn: string[];
}) {
  const keys = useMemo(() => imageKeys(script), [script]);
  const [statuses, setStatuses] = useState<Record<string, ImageStatus>>(() =>
    Object.fromEntries(keys.map((key) => [key, alreadyDrawn.includes(key) ? "ready" : "waiting"])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [downloading, setDownloading] = useState(false);

  const [drawingSince, setDrawingSince] = useState<Record<string, number>>({});
  const statusRef = useRef(statuses);
  const active = useRef(0);
  const urlFor = useCallback((key: string) => imageUrl(comicId, key), [comicId]);

  const setKeyStatus = useCallback((key: string, value: ImageStatus) => {
    statusRef.current = { ...statusRef.current, [key]: value };
    setStatuses(statusRef.current);
  }, []);

  // Load each finished picture once so pages can draw it.
  useEffect(() => {
    for (const key of keys) {
      if (statuses[key] === "ready" && !images[key]) {
        loadImage(urlFor(key))
          .then((image) => setImages((current) => ({ ...current, [key]: image })))
          .catch(() => setKeyStatus(key, "waiting"));
      }
    }
  }, [keys, statuses, images, urlFor, setKeyStatus]);

  const draw = useCallback(
    async (key: string) => {
      for (let attempt = 0; ; attempt++) {
        const response = await fetch(`/api/comics/${comicId}/images/${key}`, { method: "POST" }).catch(() => null);
        if (response?.ok) return;
        const retryable = !response || response.status === 429 || response.status >= 500;
        if (!retryable || attempt >= 2) {
          const data = await response?.json().catch(() => ({}));
          throw new Error(data?.error ?? "Something went wrong.");
        }
        await new Promise((resolve) => setTimeout(resolve, 10_000 * (attempt + 1)));
      }
    },
    [comicId],
  );

  /** Keeps up to CONCURRENCY workers drawing whatever is still waiting, in reading order. */
  const startWorkers = useCallback(() => {
    const worker = async () => {
      for (;;) {
        const next = keys.find((key) => statusRef.current[key] === "waiting");
        if (!next) return;
        setKeyStatus(next, "drawing");
        setDrawingSince((current) => ({ ...current, [next]: Date.now() }));
        try {
          await draw(next);
          setKeyStatus(next, "ready");
        } catch (err) {
          setErrors((current) => ({ ...current, [next]: (err as Error).message }));
          setKeyStatus(next, "error");
        }
      }
    };
    while (active.current < CONCURRENCY) {
      active.current++;
      worker().finally(() => active.current--);
    }
  }, [keys, draw, setKeyStatus]);

  useEffect(() => {
    startWorkers();
  }, [startWorkers]);

  const retry = (key: string) => {
    setKeyStatus(key, "waiting");
    startWorkers();
  };

  const readyCount = keys.filter((key) => statuses[key] === "ready").length;
  const allReady = readyCount === keys.length;
  const waitingCount = keys.filter((key) => statuses[key] === "waiting").length;
  const drawingCount = keys.filter((key) => statuses[key] === "drawing").length;
  // Several pictures draw at once, within OpenAI's per-minute limit; pad for the last few.
  const secondsLeft = waitingCount * ESTIMATES.picturePerComic + (drawingCount > 0 ? ESTIMATES.picture : 0);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadComicPdf(script, urlFor, style, renderFonts);
    } finally {
      setDownloading(false);
    }
  }

  async function savePage(which: "cover" | number) {
    const source = which === "cover" ? ({ kind: "cover" } as const) : ({ kind: "page", index: which } as const);
    const canvas = await renderFullPage(source, script, urlFor, style, renderFonts);
    await downloadPagePng(canvas, script.title, which === "cover" ? "cover" : `page-${which + 1}`);
  }

  const pageProps = (which: "cover" | number) => {
    const pageKeys = which === "cover" ? ["cover"] : script.pages[which].panels.map((_, i) => panelKey(which, i));
    return {
      script,
      style,
      which,
      keys: pageKeys,
      images: pageKeys.map((key) => images[key] ?? null),
      statuses: pageKeys.map((key) => statuses[key]),
      drawingSince: pageKeys.map((key) => drawingSince[key]),
      errors: pageKeys.map((key) => errors[key]),
      onRetry: retry,
      onSave: () => savePage(which),
    };
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3 text-center">
        <h1 className="font-title text-5xl tracking-wide sm:text-6xl">{script.title}</h1>
        <p className="text-neutral-700">
          {script.pages.length} pages · {countPanels(script)} panels · {style.label} style
        </p>
        <div className="mx-auto max-w-md">
          <div className="h-4 overflow-hidden rounded-full border-2 border-ink bg-white">
            <div className="h-full bg-pop transition-all" style={{ width: `${(readyCount / keys.length) * 100}%` }} />
          </div>
          <p className="mt-2 text-sm text-neutral-700">
            {allReady
              ? "Your comic is ready!"
              : `Drawing ${readyCount} of ${keys.length} pictures… about ${formatDuration(secondsLeft)} left. Keep this page open.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!allReady || downloading}
            className="comic-box bg-zap px-8 py-3 font-title text-2xl tracking-wide text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {downloading ? "Preparing PDF…" : "⬇ Download PDF"}
          </button>
          <Link href="/" className="comic-box bg-white px-8 py-3 font-title text-2xl tracking-wide hover:-translate-y-0.5">
            Make another
          </Link>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {script.cover && <ComicPageCanvas {...pageProps("cover")} />}
        {script.pages.map((_, index) => (
          <ComicPageCanvas key={index} {...pageProps(index)} />
        ))}
      </div>
    </div>
  );
}
