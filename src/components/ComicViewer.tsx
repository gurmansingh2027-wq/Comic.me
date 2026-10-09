"use client";

import Link from "next/link";
import type { qaStatus } from "@/lib/qa/service";
type QaStatus = ReturnType<typeof qaStatus>;
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countPanels, imageKeys, imageUrl, panelKey, type ComicScript, type Panel } from "@/lib/comic";
import { COPY, pick } from "@/lib/copy";
import { downloadComicPdf, downloadPagePng, loadImage, renderFullPage } from "@/lib/engines/render";
import { renderFonts } from "@/lib/fonts";
import { getStyle } from "@/lib/styles";
import ComicPageCanvas, { type ImageStatus } from "./ComicPageCanvas";
import ComicPageEditor from "./ComicPageEditor";
import { ESTIMATES, formatDuration } from "./Countdown";

/**
 * How many pictures are drawn at the same time. Kept low because new OpenAI accounts
 * may only draw 5 images per minute; the server waits and retries when it hits that limit.
 */
const CONCURRENCY = 3;

type Props = {
  comicId: string;
  styleId: string;
  script: ComicScript;
  alreadyDrawn: string[];
  /** Whether the comic is on the Explore page (on by default for now). */
  initialPublished?: boolean;
  initialQa: QaStatus;
};

/**
 * Step 5: draws every picture of an approved storyboard, then lets people edit the lettering.
 * Writing and storyboard review happen on step 4; this page is only reached after approval.
 */
export default function ComicViewer({ comicId, styleId, script, alreadyDrawn, initialPublished = true, initialQa }: Props) {
  const style = getStyle(styleId)!;
  return <ComicDrawing comicId={comicId} script={script} style={style} alreadyDrawn={alreadyDrawn} initialPublished={initialPublished} initialQa={initialQa} />;
}

// --- Step 2: draw every picture, a few at a time ----------------------------------------------

function ComicDrawing({
  comicId,
  script: initialScript,
  style,
  alreadyDrawn,
  initialPublished,
  initialQa,
}: {
  initialQa: QaStatus;
  initialPublished: boolean;
  comicId: string;
  script: ComicScript;
  style: NonNullable<ReturnType<typeof getStyle>>;
  alreadyDrawn: string[];
}) {
  // The comic's text can still be edited here (it's lettered by our code), so keep a live copy.
  const [script, setScript] = useState(initialScript);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const lastSaved = useRef<string | null>(null);
  // Bumped when a picture is redrawn, so the browser loads the new version.
  const [versions, setVersions] = useState<Record<string, number>>({});
  const keys = useMemo(() => imageKeys(initialScript), [initialScript]);
  const names = useMemo(() => script.characters.map((c) => c.name), [script.characters]);
  const [statuses, setStatuses] = useState<Record<string, ImageStatus>>(() =>
    Object.fromEntries(keys.map((key) => [key, alreadyDrawn.includes(key) ? "ready" : initialQa.pictures[key]?.status === "blocked" ? "error" : "waiting"])),
  );
  const [errors, setErrors] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initialQa.pictures).filter(([, value]) => value.status === "blocked").map(([key, value]) => [key, value.notes ?? "This picture needs another try."])));
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [downloading, setDownloading] = useState(false);
  const [qa, setQa] = useState(initialQa);
  const [checking, setChecking] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const checkingRef = useRef(false);
  const qaAttempt = useRef("");
  const restarts = useRef<Record<string, string>>({});
  const redrawRequests = useRef<Record<string, { requestId: string; expectedDigest?: string; feedback: string }>>({});


  const [drawingSince, setDrawingSince] = useState<Record<string, number>>({});
  const statusRef = useRef(statuses);
  const active = useRef(0);
  const urlFor = useCallback((key: string) => `${imageUrl(comicId, key)}?v=${versions[key] ?? 0}`, [comicId, versions]);

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
        const response = await fetch(`/api/comics/${comicId}/images/${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(restarts.current[key] ? { restart: true, requestId: restarts.current[key] } : {}) }).catch(() => null);
        if (response?.ok) return;
        const retryable = !response || response.status === 425 || response.status === 429 || response.status >= 500;
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
        const next = keys.find((key) => statusRef.current[key] === "waiting" && (!initialQa.dependencies[key] || statusRef.current[initialQa.dependencies[key]] === "ready"));
        if (!next) return;
        setKeyStatus(next, "drawing");
        setDrawingSince((current) => ({ ...current, [next]: Date.now() }));
        try {
          await draw(next);
          setKeyStatus(next, "ready");
        } catch (err) {
          setErrors((current) => ({ ...current, [next]: (err as Error).message }));
          setKeyStatus(next, "error");
          void fetch(`/api/comics/${comicId}/qa`).then(r => r.json()).then(setQa);
        }
      }
    };
    while (active.current < CONCURRENCY) {
      active.current++;
      worker().finally(() => active.current--);
    }
  }, [keys, draw, setKeyStatus, initialQa.dependencies, comicId]);

  useEffect(() => {
    startWorkers();
  }, [startWorkers]);

  const retry = (key: string) => {
    if (qa.pictures[key]?.status === "blocked") restarts.current[key] = crypto.randomUUID();
    setKeyStatus(key, "waiting");
    startWorkers();
  };

  /** Redraws one picture with the reader's requested change. */
  async function redraw(key: string, feedback: string) {
    setKeyStatus(key, "drawing");
    setDrawingSince((current) => ({ ...current, [key]: Date.now() }));
    try {
      const current: QaStatus = await fetch(`/api/comics/${comicId}/qa`, { cache: "no-store" }).then(r => r.json());
      if (!redrawRequests.current[key] || redrawRequests.current[key].feedback !== feedback || redrawRequests.current[key].expectedDigest !== current.pictures[key]?.digest) redrawRequests.current[key] = { requestId: crypto.randomUUID(), expectedDigest: current.pictures[key]?.digest, feedback };
      setQa({ ...current, ready: false });
      const response = await fetch(`/api/comics/${comicId}/images/${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redraw: true, ...redrawRequests.current[key] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Couldn't redraw this panel.");
      delete redrawRequests.current[key];
      setVersions((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
      setImages((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    } catch (err) {
      setErrors((current) => ({ ...current, [key]: (err as Error).message }));
    } finally {
      // The old picture is still there if the redraw failed.
      setKeyStatus(key, "ready");
    }
  }

  // Save text and balloon edits a moment after each real change. Lettering is drawn by our code,
  // so these edits are free: the artwork underneath is never redrawn.
  useEffect(() => {
    const body = JSON.stringify({ coverTitleHidden: !!script.coverTitleHidden, pages: script.pages.map((page) => ({ panels: page.panels.map(({ caption, captionPos, dialogue, sfx, sfxPos }) => ({ caption, captionPos, dialogue, sfx, sfxPos })) })) });
    if (lastSaved.current === null) lastSaved.current = body;
    if (body === lastSaved.current) return;
    setQa(current => ({ ...current, ready: false }));
    setSaveState("saving");
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/comics/${comicId}/lettering`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => null);
      if (response?.ok) lastSaved.current = body;
      setSaveState(response?.ok ? "saved" : "error");
    }, 700);
    return () => clearTimeout(timer);
  }, [script, comicId]);

  const changePanel = (pageIndex: number, panelIndex: number, update: (panel: Panel) => Panel) =>
    setScript((current) => ({
      ...current,
      pages: current.pages.map((page, p) =>
        p === pageIndex ? { ...page, panels: page.panels.map((panel, i) => (i === panelIndex ? update(panel) : panel)) } : page,
      ),
    }));

  const readyCount = keys.filter((key) => statuses[key] === "ready").length;
  const allReady = readyCount === keys.length;
  const waitingCount = keys.filter((key) => statuses[key] === "waiting").length;
  const drawingCount = keys.filter((key) => statuses[key] === "drawing").length;
  // Several pictures draw at once, within OpenAI's per-minute limit; pad for the last few.
  const secondsLeft = waitingCount * ESTIMATES.picturePerComic + (drawingCount > 0 ? ESTIMATES.picture : 0);

  async function runChecks() {
    if (checkingRef.current || !allReady || saveState !== "saved") return;
    checkingRef.current = true; setChecking(true); setQaError(null);
    try {
      let current: QaStatus = await fetch(`/api/comics/${comicId}/qa`, { cache: "no-store" }).then(r => r.json());
      for (let round = 0; round < 3 && current.required && !current.ready; round++) {
        const before = current.revision;
        const pageIds = [...(script.cover ? ["cover"] : []), ...script.pages.map((_, p) => String(p + 1))];
        for (const page of pageIds) {
          if (current.pages[page]?.status === "accepted") continue;
          const canvas = await renderFullPage(page === "cover" ? { kind: "cover" } : { kind: "page", index: Number(page) - 1 }, script, key => `${imageUrl(comicId, key)}?qa=${current.revision}`, style, renderFonts);
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
          if (!blob) throw new Error("Couldn't prepare this page for checking.");
          const response = await fetch(`/api/comics/${comicId}/qa?page=${page}&revision=${current.revision}`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Page check interrupted.");
          current = result;
          if (current.revision !== before) break;
        }
        if (current.revision === before) {
          const response = await fetch(`/api/comics/${comicId}/qa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "final", revision: current.revision }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Final check interrupted.");
          current = result;
          if (current.revision === before && !current.ready) break;
        }
        if (current.revision !== before) {
          setImages({}); setVersions(value => Object.fromEntries(keys.map(key => [key, (value[key] ?? 0) + 1])));
        }
      }
      setQa(current);
      if (!current.ready) setQaError(current.final?.notes || "Some pictures need attention before export. Review the findings below, then retry checks.");
    } catch (error) { setQaError((error as Error).message); }
    finally { checkingRef.current = false; setChecking(false); }
  }
  const checkVersion = JSON.stringify([script, versions]);
  useEffect(() => {
    if (!allReady || saveState !== "saved" || checkingRef.current || qaAttempt.current === checkVersion) return;
    qaAttempt.current = checkVersion;
    void runChecks();
    // The revision key covers every local content change; errors require an explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allReady, saveState, checkVersion]);

  async function requireExportReady() {
    if (saveState !== "saved" || checkingRef.current) throw new Error("Wait for saved changes and continuity checks before downloading.");
    const current: QaStatus = await fetch(`/api/comics/${comicId}/qa`, { cache: "no-store" }).then(r => r.json());
    setQa(current);
    if (!current.ready) throw new Error("Finish continuity checks before downloading.");
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await requireExportReady();
      await downloadComicPdf(script, urlFor, style, renderFonts);
    } catch (error) { setQaError((error as Error).message); } finally {
      setDownloading(false);
    }
  }

  async function savePage(which: "cover" | number) {
    try { await requireExportReady(); } catch (error) { setQaError((error as Error).message); return; }
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
      onRedraw: which === "cover" ? (feedback: string) => redraw("cover", feedback) : undefined,
      titleHidden: which === "cover" ? !!script.coverTitleHidden : undefined,
      onToggleTitle: which === "cover" ? () => setScript((current) => ({ ...current, coverTitleHidden: !current.coverTitleHidden })) : undefined,
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
            {allReady ? pick(COPY.drawing.done, comicId) : COPY.drawing.progress(readyCount, keys.length, formatDuration(secondsLeft))}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!allReady || downloading || !qa.ready || checking || saveState !== "saved"}
            className="comic-box bg-zap px-8 py-3 font-title text-2xl tracking-wide text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {downloading ? "Preparing PDF…" : "⬇ Download PDF"}
          </button>
          <Link href="/" className="comic-box bg-white px-8 py-3 font-title text-2xl tracking-wide hover:-translate-y-0.5">
            Make another
          </Link>
        </div>
      </div>

      {qa.required && <section aria-live="polite" className="comic-box space-y-3 bg-white p-4">
        <p className="font-bold">{checking ? "Checking continuity and page readability…" : qa.ready && saveState === "saved" ? "Continuity checks complete." : "Continuity checks must finish before downloading or sharing."}</p>
        {qaError && <p role="alert" className="text-red-700">{qaError}</p>}
        {Object.entries(qa.pictures).filter(([, picture]) => picture.status === "blocked" || picture.status === "error").map(([key, picture]) => <p key={key} className="text-sm">{key}: {picture.notes || "This picture needs another try."}</p>)}
        {[...Object.values(qa.pages).flatMap(page => page?.findings ?? []), ...(qa.final?.findings ?? [])].map((finding, i) => <p key={i} className="text-sm">{finding.key}: {finding.what}</p>)}
        {allReady && !checking && !qa.ready && <button className="rounded border-2 border-ink px-4 py-2 font-bold" disabled={saveState !== "saved"} onClick={runChecks}>Retry checks</button>}
      </section>}

      {allReady && qa.ready && saveState === "saved" && <ShareToExplore comicId={comicId} initialPublished={initialPublished} />}

      {allReady && (
        <p className="text-center text-sm text-neutral-700">
          ✏️ Tip: drag or click any speech bubble or caption to move or edit it, or press <strong>Redraw</strong> on a panel you
          don&apos;t like. {saveState === "saving" ? "Saving…" : saveState === "error" ? "⚠️ Changes not saved" : ""}
        </p>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        {script.cover && <ComicPageCanvas {...pageProps("cover")} />}
        {script.pages.map((page, index) => {
          const pageKeys = page.panels.map((_, i) => panelKey(index, i));
          return (
            <ComicPageEditor
              key={index}
              page={page}
              pageIndex={index}
              style={style}
              names={names}
              keys={pageKeys}
              images={pageKeys.map((key) => images[key] ?? null)}
              statuses={pageKeys.map((key) => statuses[key])}
              drawingSince={pageKeys.map((key) => drawingSince[key])}
              errors={pageKeys.map((key) => errors[key])}
              onRetry={retry}
              onRedraw={redraw}
              onChangePanel={(panelIndex, update) => changePanel(index, panelIndex, update)}
              onSave={() => savePage(index)}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Every comic goes on Explore for now; the owner can hide it (and bring it back) any time. */
function ShareToExplore({ comicId, initialPublished }: { comicId: string; initialPublished: boolean }) {
  const [published, setPublished] = useState(initialPublished);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/comics/${comicId}/explore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !published }),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    if (response?.ok) setPublished(data.explore.published);
    else setError(data?.error ?? "Couldn't change that. Please try again.");
    setBusy(false);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded border-2 border-ink bg-white p-3 text-sm">
      <div>
        <p className="font-bold">{published ? "🌍 On the Explore wall" : "🔒 Hidden from Explore"}</p>
        <p className="text-neutral-600">
          {published
            ? "Others see the finished art and can recreate its format with their own story. Never your story text, photos or character sheets."
            : "Only you can see it. Put it back any time."}
        </p>
        {error && <p className="font-bold text-zap">{error}</p>}
      </div>
      <button type="button" onClick={toggle} disabled={busy} className="rounded border-2 border-ink bg-pop px-3 py-1.5 font-bold disabled:opacity-50">
        {published ? "Hide from Explore" : "Put back on Explore"}
      </button>
    </div>
  );
}
