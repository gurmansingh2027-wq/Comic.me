"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { panelImageUrl, type ComicScript } from "@/lib/comic";
import { downloadComic } from "@/lib/engines/render";
import { renderFonts } from "@/lib/fonts";
import ComicPanel, { type PanelStatus } from "./ComicPanel";

type Props = {
  comicId: string;
  script: ComicScript;
  initiallyReady: boolean[];
};

export default function ComicViewer({ comicId, script, initiallyReady }: Props) {
  const [statuses, setStatuses] = useState<PanelStatus[]>(() =>
    initiallyReady.map((ready) => (ready ? "ready" : "drawing")),
  );
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [downloading, setDownloading] = useState(false);
  const started = useRef(false);

  const setStatus = useCallback((index: number, status: PanelStatus) => {
    setStatuses((current) => current.map((value, i) => (i === index ? status : value)));
  }, []);

  const drawPanel = useCallback(
    async (index: number) => {
      try {
        const response = await fetch(`/api/comics/${comicId}/panels/${index + 1}`, { method: "POST" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Something went wrong.");
        setStatus(index, "ready");
      } catch (err) {
        setErrors((current) => ({ ...current, [index]: err instanceof Error ? err.message : "Something went wrong." }));
        setStatus(index, "error");
      }
    },
    [comicId, setStatus],
  );

  // Ask the server to draw every missing panel, all at the same time.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    initiallyReady.forEach((ready, index) => {
      if (!ready) drawPanel(index);
    });
  }, [initiallyReady, drawPanel]);

  const retry = (index: number) => {
    setStatus(index, "drawing");
    drawPanel(index);
  };

  const readyCount = statuses.filter((status) => status === "ready").length;
  const allReady = readyCount === statuses.length;

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadComic(
        script,
        statuses.map((_, i) => panelImageUrl(comicId, i + 1)),
        renderFonts,
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="font-title text-5xl tracking-wide sm:text-6xl">{script.title}</h1>
        <p className="mt-2 text-neutral-700">
          {allReady
            ? "Your comic is ready!"
            : `Drawing your panels… ${readyCount} of ${statuses.length} done. This usually takes 1–2 minutes.`}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {script.panels.map((panel, index) => (
          <ComicPanel
            key={index}
            number={index + 1}
            panel={panel}
            imageUrl={panelImageUrl(comicId, index + 1)}
            status={statuses[index]}
            error={errors[index]}
            onRetry={() => retry(index)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={handleDownload}
          disabled={!allReady || downloading}
          className="comic-box bg-zap px-8 py-3 font-title text-2xl tracking-wide text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {downloading ? "Preparing…" : "⬇ Download comic"}
        </button>
        <Link href="/" className="comic-box bg-white px-8 py-3 font-title text-2xl tracking-wide hover:-translate-y-0.5">
          Make another
        </Link>
      </div>
    </div>
  );
}
