"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { countPanels, MAX_PAGES, MAX_PANELS, type BalloonKind, type ComicScript, type DialogueLine, type LetterPos, type Page, type Panel, type PanelCast, type SceneContext, type Shot } from "@/lib/comic";
import { drawingCost, formatUsd } from "@/lib/costs";
import { fitLayout, LAYOUT_IDS, LAYOUTS, type LayoutId } from "@/lib/layouts";
import { getStyle } from "@/lib/styles";
import { ESTIMATES, formatDuration } from "./Countdown";
import Stepper from "./Stepper";
import WireframePage, { type LetterRef } from "./WireframePage";

const SHOTS: Shot[] = ["establishing", "wide", "medium", "close-up", "extreme close-up"];
const KINDS: { kind: BalloonKind; label: string }[] = [
  { kind: "speech", label: "💬 Speech" },
  { kind: "shout", label: "🗯 Shout" },
  { kind: "whisper", label: "🤫 Whisper" },
  { kind: "thought", label: "💭 Thought" },
];
const LAYOUT_NAMES: Record<LayoutId, string> = {
  splash: "Full-page splash",
  "two-tier": "2 wide panels",
  "big-top": "Big panel on top + 2",
  "big-bottom": "2 + big panel below",
  "three-tier": "3 wide strips",
  "tall-left": "Tall panel left + 2",
  "grid-4": "4 equal panels",
  "wide-top-three": "Wide panel + 3 tall",
  sandwich: "Strip, 2 panels, strip",
  five: "5 panels",
  "grid-6": "6 equal panels",
  "staggered-6": "6 staggered panels",
};

const field = "w-full rounded border-2 border-ink px-2 py-1.5 text-sm focus:outline-none focus:ring-4 focus:ring-pop";
const compact = "rounded border-2 border-ink bg-white px-2 py-1 text-xs focus:outline-none focus:ring-4 focus:ring-pop";
const small = "rounded border-2 border-ink bg-white px-2 py-1 text-xs font-bold hover:bg-pop disabled:opacity-40";

type Selection = { page: number } & LetterRef;

/** Which cover idea is currently chosen (matched by its concept), if the art director offered several. */
function coverChoice(script: ComicScript): number | undefined {
  const k = script.cover?.options?.findIndex((option) => option.design.concept === script.cover?.design?.concept);
  return k === undefined || k < 0 ? undefined : k;
}

function emptyPanel(): Panel {
  return { shot: "medium", scene: "", caption: "", dialogue: [] };
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export type CastStages = { name: string; stages: { id: string; label: string }[] }[];

export default function StoryboardEditor({
  comicId,
  styleId,
  initialScript,
  castStages = [],
}: {
  comicId: string;
  styleId: string;
  initialScript: ComicScript;
  /** Each cast member's life stages, so panels can be switched between ages. */
  castStages?: CastStages;
}) {
  const router = useRouter();
  const style = getStyle(styleId)!;
  const [script, setScript] = useState(initialScript);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);
  const firstRender = useRef(true);
  const names = useMemo(() => script.characters.map((c) => c.name), [script.characters]);
  const stageLabels = useMemo(
    () => Object.fromEntries(castStages.flatMap((member) => member.stages.map((stage) => [`${member.name}|${stage.id}`, stage.label]))),
    [castStages],
  );

  // Save a moment after each change.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/comics/${comicId}/storyboard`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: script.title, tagline: script.tagline, coverChoice: coverChoice(script), coverScene: script.cover?.scene, pages: script.pages }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Couldn't save your changes.");
        setSaveState("saved");
        setSaveError(null);
      } catch (err) {
        setSaveState("error");
        setSaveError((err as Error).message);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [script, comicId]);

  const totalPanels = countPanels(script);
  const pictures = totalPanels + (script.cover ? 1 : 0);

  // --- Editing helpers ---------------------------------------------------------------------
  const setPages = (fn: (pages: Page[]) => Page[]) => setScript((current) => ({ ...current, pages: fn(current.pages) }));
  const setPage = (p: number, fn: (page: Page) => Page) => setPages((pages) => pages.map((page, i) => (i === p ? fn(page) : page)));
  const setPanels = (p: number, fn: (panels: Panel[]) => Panel[]) =>
    setPage(p, (page) => {
      const panels = fn(page.panels);
      return { ...page, panels, layout: fitLayout(page.layout, panels.length) };
    });
  const setPanel = (p: number, i: number, fn: (panel: Panel) => Panel) => setPanels(p, (panels) => panels.map((panel, j) => (j === i ? fn(panel) : panel)));
  const setLine = (p: number, i: number, l: number, patch: Partial<DialogueLine>) =>
    setPanel(p, i, (panel) => ({ ...panel, dialogue: panel.dialogue.map((line, k) => (k === l ? { ...line, ...patch } : line)) }));

  function moveLettering(p: number, ref: LetterRef, pos: LetterPos | null) {
    setPanel(p, ref.panel, (panel) =>
      ref.ref === "caption"
        ? { ...panel, captionPos: pos ?? undefined }
        : { ...panel, dialogue: panel.dialogue.map((line, k) => (k === ref.ref ? { ...line, pos: pos ?? undefined } : line)) },
    );
  }

  function select(p: number, ref: LetterRef) {
    setSelected({ page: p, ...ref });
    const id = ref.ref === "caption" ? `caption-${p}-${ref.panel}` : `line-${p}-${ref.panel}-${ref.ref}`;
    const input = document.getElementById(id) as HTMLInputElement | null;
    input?.focus({ preventScroll: true });
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function approve() {
    setApproving(true);
    setApproveError(null);
    try {
      // Make sure the latest edits are saved first.
      const saved = await fetch(`/api/comics/${comicId}/storyboard`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: script.title, tagline: script.tagline, coverChoice: coverChoice(script), coverScene: script.cover?.scene, pages: script.pages }),
      });
      if (!saved.ok) throw new Error((await saved.json().catch(() => ({}))).error ?? "Couldn't save your changes.");
      const response = await fetch(`/api/comics/${comicId}/storyboard`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Couldn't start drawing.");
      router.push(`/comic/${comicId}`);
    } catch (err) {
      setApproveError((err as Error).message);
      setApproving(false);
    }
  }

  return (
    <div className="space-y-8">
      <Stepper current="Storyboard" />

      <section className="comic-box space-y-4 bg-white p-6">
        <p className="text-sm font-bold uppercase tracking-widest text-neutral-600">{style.label} · Storyboard</p>
        <h1 className="font-title text-4xl tracking-wide sm:text-5xl">Check your storyboard</h1>
        <p className="max-w-3xl text-neutral-700">
          This is the plan for every page, before anything is drawn. Edit the dialogue, captions and what happens in each
          panel; add or remove panels and pages; pick page layouts. <strong>Drag speech bubbles and captions anywhere</strong>,
          drag their corner to resize them, or click one to edit its text. Nothing costs money until you approve.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-bold">
            Title
            <input value={script.title} maxLength={120} onChange={(e) => setScript({ ...script, title: e.target.value })} className={field} />
          </label>
          <label className="space-y-1 text-sm font-bold">
            Cover tagline
            <input value={script.tagline} maxLength={200} onChange={(e) => setScript({ ...script, tagline: e.target.value })} className={field} />
          </label>
        </div>
        {script.cover && (
          <div className="space-y-2">
            <p className="text-sm font-bold">🎨 Cover idea {script.cover.options && script.cover.options.length > 1 && "· pick one (nothing is drawn yet)"}</p>
            {script.cover.options && script.cover.options.length > 1 && (
              <div className="grid gap-2 md:grid-cols-3">
                {script.cover.options.map((option, k) => {
                  const chosen = coverChoice(script) === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setScript({ ...script, cover: { ...script.cover!, scene: option.scene, design: option.design } })}
                      className={`rounded border-3 p-3 text-left text-sm ${chosen ? "border-ink bg-pop shadow-[3px_3px_0_#111]" : "border-neutral-300 bg-paper hover:border-ink"}`}
                    >
                      <span className="block text-xs font-bold uppercase tracking-wide text-neutral-600">
                        {option.design.approach?.replace(/-/g, " ") ?? "idea"} · title in {option.design.titleFont}
                      </span>
                      <span className="mt-1 block">{option.design.concept}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <label className="block space-y-1 text-xs font-bold">
              Brief for the cover artist (edit if you like)
              <textarea
                value={script.cover.scene}
                rows={3}
                maxLength={3000}
                onChange={(e) => setScript({ ...script, cover: { ...script.cover!, scene: e.target.value } })}
                className={`${field} resize-y font-normal`}
              />
            </label>
          </div>
        )}
      </section>

      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded border-3 border-ink bg-pop px-4 py-3 shadow-[4px_4px_0_#111]">
        <p className="text-sm font-bold">
          {script.pages.length} pages · {totalPanels} panels · drawing takes about {formatDuration(pictures * ESTIMATES.picturePerComic + ESTIMATES.picture)} and
          costs about {formatUsd(drawingCost(totalPanels, !!script.cover))}
          <span className="ml-3 font-normal">{saveState === "saving" ? "Saving…" : saveState === "error" ? "⚠️ Not saved" : "✓ Saved"}</span>
        </p>
        <button
          type="button"
          onClick={approve}
          disabled={approving || saveState === "error"}
          className="comic-box bg-zap px-6 py-2 font-title text-2xl tracking-wide text-white disabled:opacity-50"
        >
          {approving ? "Starting…" : "✓ Approve & draw my comic →"}
        </button>
      </div>

      {[saveError, approveError].filter(Boolean).map((message) => (
        <p key={message} role="alert" className="rounded border-2 border-zap bg-red-50 p-3 font-bold text-zap">{message}</p>
      ))}

      {script.pages.map((page, p) => {
        const sameCount = LAYOUT_IDS.filter((id) => LAYOUTS[id].panels.length === page.panels.length);
        return (
          <section key={p} className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-title text-3xl tracking-wide">Page {p + 1}</h2>
                <div className="flex flex-wrap gap-1">
                  <button className={small} disabled={p === 0} onClick={() => setPages((pages) => move(pages, p, p - 1))}>↑ Move up</button>
                  <button className={small} disabled={p === script.pages.length - 1} onClick={() => setPages((pages) => move(pages, p, p + 1))}>↓ Move down</button>
                  <button className={small} disabled={script.pages.length <= 1} onClick={() => setPages((pages) => pages.filter((_, i) => i !== p))}>✕ Delete page</button>
                </div>
              </div>
              <div className="lg:sticky lg:top-24">
                <WireframePage
                  page={page}
                  pageNumber={p + 1}
                  style={style}
                  names={names}
                  stageLabels={stageLabels}
                  selected={selected?.page === p ? selected : null}
                  onSelect={(ref) => select(p, ref)}
                  onMove={(ref, pos) => moveLettering(p, ref, pos)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-bold">
                Page layout
                <select value={page.layout} onChange={(e) => setPage(p, (pg) => ({ ...pg, layout: e.target.value as LayoutId }))} className={`${field} w-auto`}>
                  {sameCount.map((id) => <option key={id} value={id}>{LAYOUT_NAMES[id]}</option>)}
                </select>
                <span className="font-normal text-neutral-600">(changes with the number of panels)</span>
              </label>

              {page.panels.map((panel, i) => (
                <div key={i} className={`space-y-2 rounded border-2 bg-white p-3 ${selected?.page === p && selected.panel === i ? "border-zap" : "border-ink"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-title text-xl tracking-wide">Panel {i + 1}</span>
                    <div className="flex flex-wrap items-center gap-1">
                      <select value={panel.shot} onChange={(e) => setPanel(p, i, (pn) => ({ ...pn, shot: e.target.value as Shot }))} className={`${field} w-auto py-0.5 text-xs`} aria-label="Camera shot">
                        {SHOTS.map((shot) => <option key={shot} value={shot}>{shot}</option>)}
                      </select>
                      <button className={small} disabled={i === 0} onClick={() => setPanels(p, (panels) => move(panels, i, i - 1))} aria-label="Move panel earlier">↑</button>
                      <button className={small} disabled={i === page.panels.length - 1} onClick={() => setPanels(p, (panels) => move(panels, i, i + 1))} aria-label="Move panel later">↓</button>
                      <button className={small} disabled={page.panels.length <= 1} onClick={() => setPanels(p, (panels) => panels.filter((_, j) => j !== i))}>✕ Remove</button>
                    </div>
                  </div>
                  <label className="block space-y-1 text-xs font-bold">
                    What we see (for the artist)
                    <textarea value={panel.scene} rows={2} maxLength={2000} onChange={(e) => setPanel(p, i, (pn) => ({ ...pn, scene: e.target.value }))} placeholder="Who is in the panel, where, doing what, how they feel" className={`${field} resize-y`} />
                  </label>
                  {panel.context && (
                    <SceneDetails
                      context={panel.context}
                      names={names}
                      castStages={castStages}
                      onChange={(context) => setPanel(p, i, (pn) => ({ ...pn, context }))}
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <input id={`caption-${p}-${i}`} value={panel.caption} maxLength={400} onChange={(e) => setPanel(p, i, (pn) => ({ ...pn, caption: e.target.value }))} placeholder="Caption (narration box), optional" className={`${field} bg-amber-50`} />
                    {panel.captionPos && <button className={small} onClick={() => moveLettering(p, { panel: i, ref: "caption" }, null)} title="Put it back in its automatic spot">↺ Auto</button>}
                  </div>
                  {panel.dialogue.map((line, l) => (
                    <div key={l} className="space-y-1 rounded border border-neutral-300 bg-paper p-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select value={line.speaker} onChange={(e) => setLine(p, i, l, { speaker: e.target.value })} className={compact} aria-label="Speaker">
                          {[...new Set([...names, line.speaker])].map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                        <select value={line.kind} onChange={(e) => setLine(p, i, l, { kind: e.target.value as BalloonKind })} className={compact} aria-label="Balloon type">
                          {KINDS.map(({ kind, label }) => <option key={kind} value={kind}>{label}</option>)}
                        </select>
                        <button className={small} onClick={() => setLine(p, i, l, { side: line.side === "left" ? "right" : "left" })} title="Which side the speaker stands on">
                          {line.side === "left" ? "◀ Left" : "Right ▶"}
                        </button>
                        {line.pos && <button className={small} onClick={() => moveLettering(p, { panel: i, ref: l }, null)} title="Put it back in its automatic spot">↺ Auto-place</button>}
                        <button className={`${small} ml-auto`} onClick={() => setPanel(p, i, (pn) => ({ ...pn, dialogue: pn.dialogue.filter((_, k) => k !== l) }))} aria-label="Remove this line">✕</button>
                      </div>
                      <input id={`line-${p}-${i}-${l}`} value={line.text} maxLength={400} onChange={(e) => setLine(p, i, l, { text: e.target.value })} placeholder="What they say" className={field} />
                    </div>
                  ))}
                  {panel.dialogue.length < 4 && (
                    <button
                      className={small}
                      onClick={() => setPanel(p, i, (pn) => ({ ...pn, dialogue: [...pn.dialogue, { speaker: names[0] ?? "Someone", side: pn.dialogue.length % 2 ? "right" : "left", kind: "speech", text: "" }] }))}
                    >
                      + Add a line
                    </button>
                  )}
                </div>
              ))}

              <div className="flex flex-wrap gap-2">
                <button className={small} disabled={page.panels.length >= 6 || totalPanels >= MAX_PANELS} onClick={() => setPanels(p, (panels) => [...panels, emptyPanel()])}>
                  + Add a panel to this page
                </button>
                <button
                  className={small}
                  disabled={script.pages.length >= MAX_PAGES || totalPanels >= MAX_PANELS}
                  onClick={() => setPages((pages) => [...pages.slice(0, p + 1), { layout: "splash", panels: [emptyPanel()] }, ...pages.slice(p + 1)])}
                >
                  + Add a page after this one
                </button>
              </div>
            </div>
          </section>
        );
      })}

      <div className="text-center">
        <button
          type="button"
          onClick={approve}
          disabled={approving || saveState === "error"}
          className="comic-box bg-zap px-10 py-4 font-title text-3xl tracking-wide text-white disabled:opacity-50"
        >
          {approving ? "Starting…" : "✓ Approve & draw my comic →"}
        </button>
        {approveError && <p role="alert" className="mt-3 font-bold text-zap">{approveError}</p>}
      </div>
    </div>
  );
}

/** Where, when, who (at what age) and what they wear: the facts each picture is built from. */
function SceneDetails({
  context,
  names,
  castStages,
  onChange,
}: {
  context: SceneContext;
  names: string[];
  castStages: CastStages;
  onChange: (context: SceneContext) => void;
}) {
  const [open, setOpen] = useState(false);
  const stagesOf = (name: string) => castStages.find((member) => member.name === name)?.stages ?? [];
  const stageName = (name: string, id: string) => stagesOf(name).find((stage) => stage.id === id)?.label;
  const when = [context.period, context.timeOfDay, context.weather].filter(Boolean).join(", ");
  const setPerson = (index: number, patch: Partial<PanelCast>) =>
    onChange({ ...context, cast: context.cast.map((person, k) => (k === index ? { ...person, ...patch } : person)) });

  return (
    <div className="rounded border border-neutral-300 bg-paper p-2 text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left">
        <span className="font-bold">{open ? "▾" : "▸"} Scene details</span>{" "}
        <span className="text-neutral-700">
          {context.location && `📍 ${context.location}`} {when && `· 🕒 ${when}`}
          {context.cast.length > 0 &&
            ` · 👕 ${context.cast
              .map((person) => `${person.name}${person.stage ? ` (${stageName(person.name, person.stage) ?? person.stage})` : ""}: ${person.wardrobe || "?"}`)
              .join("; ")}`}
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(
              [
                ["location", "Where"],
                ["period", "Year / era"],
                ["timeOfDay", "Time of day"],
                ["weather", "Weather"],
                ["event", "Occasion"],
                ["continuity", "Must match previous panel"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="space-y-0.5 font-bold">
                {label}
                <input value={context[key]} maxLength={300} onChange={(e) => onChange({ ...context, [key]: e.target.value })} className={compact + " w-full"} />
              </label>
            ))}
          </div>
          {context.cast.map((person, index) => (
            <div key={index} className="grid items-center gap-1.5 sm:grid-cols-[7rem_8rem_1fr_7rem_auto]">
              <span className="font-bold">{person.name}</span>
              <select value={person.stage} onChange={(e) => setPerson(index, { stage: e.target.value })} className={compact} aria-label={`${person.name}'s age in this panel`}>
                <option value="">Main age</option>
                {stagesOf(person.name).map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
              </select>
              <input value={person.wardrobe} maxLength={300} onChange={(e) => setPerson(index, { wardrobe: e.target.value })} placeholder="Wearing" className={compact} aria-label={`What ${person.name} wears`} />
              <input value={person.emotion} maxLength={300} onChange={(e) => setPerson(index, { emotion: e.target.value })} placeholder="Feeling" className={compact} aria-label={`How ${person.name} feels`} />
              <button type="button" className={small} onClick={() => onChange({ ...context, cast: context.cast.filter((_, k) => k !== index) })} aria-label={`Remove ${person.name} from this panel`}>✕</button>
            </div>
          ))}
          <select
            value=""
            onChange={(e) => e.target.value && onChange({ ...context, cast: [...context.cast, { name: e.target.value, stage: "", wardrobe: "", emotion: "", action: "" }] })}
            className={compact}
            aria-label="Add someone to this panel"
          >
            <option value="">+ Add someone to this panel</option>
            {names.filter((name) => !context.cast.some((person) => person.name === name)).map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
