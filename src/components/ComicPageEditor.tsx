"use client";

import { useState } from "react";
import type { BalloonKind, DialogueLine, LetterPos, Page, Panel } from "@/lib/comic";
import { PAGE_H, PAGE_W, pageBoxes } from "@/lib/engines/render";
import type { ComicStyle } from "@/lib/styles";
import type { ImageStatus } from "./ComicPageCanvas";
import Countdown, { ESTIMATES } from "./Countdown";
import WireframePage, { type LetterRef } from "./WireframePage";

const KINDS: { kind: BalloonKind; label: string }[] = [
  { kind: "speech", label: "💬 Speech" },
  { kind: "shout", label: "🗯 Shout" },
  { kind: "whisper", label: "🤫 Whisper" },
  { kind: "thought", label: "💭 Thought" },
  { kind: "robot", label: "🤖 Robot" },
];
const small = "rounded border-2 border-ink bg-white px-2 py-1 text-xs font-bold hover:bg-pop disabled:opacity-40";

type Props = {
  page: Page;
  pageIndex: number;
  style: ComicStyle;
  names: string[];
  keys: string[];
  images: (HTMLImageElement | null)[];
  statuses: ImageStatus[];
  drawingSince: (number | undefined)[];
  errors: (string | undefined)[];
  onRetry: (key: string) => void;
  onRedraw: (key: string, feedback: string) => void;
  onChangePanel: (panelIndex: number, update: (panel: Panel) => Panel) => void;
  onSave: () => void;
};

/** A finished comic page: drag or edit captions and balloons, and redraw any single panel. */
export default function ComicPageEditor(props: Props) {
  const { page, pageIndex, style, names, keys, images, statuses, drawingSince, errors, onRetry, onRedraw, onChangePanel, onSave } = props;
  const [selected, setSelected] = useState<LetterRef | null>(null);
  const [redrawing, setRedrawing] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const boxes = pageBoxes(page);
  const allReady = statuses.every((status) => status === "ready");

  function moveLettering(ref: LetterRef, pos: LetterPos | null) {
    onChangePanel(ref.panel, (panel) =>
      ref.ref === "caption"
        ? { ...panel, captionPos: pos ?? undefined }
        : ref.ref === "sfx"
          ? { ...panel, sfxPos: pos ?? undefined }
          : { ...panel, dialogue: panel.dialogue.map((line, k) => (k === ref.ref ? { ...line, pos: pos ?? undefined } : line)) },
    );
  }
  const setLine = (panelIndex: number, l: number, patch: Partial<DialogueLine>) =>
    onChangePanel(panelIndex, (panel) => ({ ...panel, dialogue: panel.dialogue.map((line, k) => (k === l ? { ...line, ...patch } : line)) }));

  const selectedPanel = selected ? page.panels[selected.panel] : null;
  const selectedLine = selected && typeof selected.ref === "number" ? selectedPanel?.dialogue[selected.ref] : null;

  return (
    <figure className="space-y-2">
      <WireframePage
        page={page}
        pageNumber={pageIndex + 1}
        style={style}
        names={names}
        images={images}
        selected={selected}
        onSelect={(ref) => {
          setRedrawing(null);
          setSelected(ref);
        }}
        onMove={moveLettering}
      >
        {boxes.map((box, i) => {
          const status = statuses[i];
          const position = {
            left: `${(box.x / PAGE_W) * 100}%`,
            top: `${(box.y / PAGE_H) * 100}%`,
            width: `${(box.w / PAGE_W) * 100}%`,
            height: `${(box.h / PAGE_H) * 100}%`,
          };
          if (status === "ready") {
            return (
              <div key={keys[i]} className="pointer-events-none absolute" style={position}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setRedrawing(i);
                    setFeedback("");
                  }}
                  className="pointer-events-auto absolute right-1 bottom-1 rounded border-2 border-ink bg-white/90 px-2 py-0.5 text-[11px] font-bold opacity-80 shadow hover:bg-pop hover:opacity-100"
                  title="Not happy with this panel? Redraw it"
                >
                  ✏️ Redraw
                </button>
              </div>
            );
          }
          return (
            <div key={keys[i]} className="absolute flex flex-col items-center justify-center gap-2 p-2 text-center" style={position}>
              {status === "error" ? (
                <div className="rounded border-2 border-ink bg-white/95 p-2 text-xs">
                  <p className="font-bold text-zap">Couldn&apos;t draw this one</p>
                  {errors[i] && <p className="mt-1 line-clamp-3">{errors[i]}</p>}
                  <button type="button" onClick={() => onRetry(keys[i])} className="mt-2 rounded border-2 border-ink bg-pop px-3 py-1 font-bold">
                    Try again
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 rounded bg-white/85 px-3 py-2">
                  {status === "drawing" && <div className="h-6 w-6 animate-spin rounded-full border-3 border-ink border-t-pop" />}
                  <span className="text-xs font-bold">{status === "drawing" ? "Drawing…" : "In the queue"}</span>
                  {status === "drawing" && drawingSince[i] && <Countdown startedAt={drawingSince[i]!} seconds={ESTIMATES.picture} className="text-[11px]" />}
                </div>
              )}
            </div>
          );
        })}
      </WireframePage>

      {redrawing !== null && (
        <div className="space-y-2 rounded border-3 border-ink bg-pop p-3">
          <p className="text-sm font-bold">Redraw panel {redrawing + 1} on page {pageIndex + 1}: what should change?</p>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={2}
            maxLength={1000}
            autoFocus
            placeholder="For example: show Papa's face more clearly, make it night time, Anu should be laughing"
            className="w-full rounded border-2 border-ink bg-white px-2 py-1.5 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onRedraw(keys[redrawing], feedback);
                setRedrawing(null);
              }}
              className="rounded border-2 border-ink bg-zap px-3 py-1.5 text-sm font-bold text-white"
            >
              Redraw this panel (about {ESTIMATES.picture} sec)
            </button>
            <button type="button" onClick={() => setRedrawing(null)} className={small}>
              Cancel
            </button>
            <span className="text-xs">Only this panel is redrawn; the text stays as it is.</span>
          </div>
        </div>
      )}

      {selected && selectedPanel && (
        <div className="space-y-2 rounded border-3 border-ink bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">
              {selected.ref === "caption" ? "Caption" : selected.ref === "sfx" ? "Sound effect" : `${selectedLine?.speaker ?? "Balloon"} says`} · panel {selected.panel + 1}
            </p>
            <button type="button" onClick={() => setSelected(null)} className={small}>
              Done
            </button>
          </div>
          {selected.ref === "sfx" ? (
            <input
              value={selectedPanel.sfx ?? ""}
              onChange={(event) => onChangePanel(selected.panel, (panel) => ({ ...panel, sfx: event.target.value }))}
              maxLength={40}
              autoFocus
              placeholder="e.g. KRAK!"
              className="w-full rounded border-2 border-ink px-2 py-1.5 text-sm"
            />
          ) : selected.ref === "caption" ? (
            <textarea
              value={selectedPanel.caption}
              onChange={(event) => onChangePanel(selected.panel, (panel) => ({ ...panel, caption: event.target.value }))}
              rows={2}
              maxLength={400}
              autoFocus
              className="w-full rounded border-2 border-ink px-2 py-1.5 text-sm"
            />
          ) : (
            selectedLine && (
              <>
                <textarea
                  value={selectedLine.text}
                  onChange={(event) => setLine(selected.panel, selected.ref as number, { text: event.target.value })}
                  rows={2}
                  maxLength={400}
                  autoFocus
                  className="w-full rounded border-2 border-ink px-2 py-1.5 text-sm"
                />
                <div className="flex flex-wrap gap-1.5">
                  {KINDS.map(({ kind, label }) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setLine(selected.panel, selected.ref as number, { kind })}
                      className={`${small} ${selectedLine.kind === kind ? "bg-pop" : ""}`}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setLine(selected.panel, selected.ref as number, { side: selectedLine.side === "left" ? "right" : "left" })}
                    className={small}
                  >
                    Tail points {selectedLine.side === "left" ? "◀ left" : "right ▶"}
                  </button>
                </div>
              </>
            )
          )}
          <button type="button" onClick={() => moveLettering(selected, null)} className={small}>
            ↺ Put it back in its automatic spot
          </button>
        </div>
      )}

      <figcaption className="flex items-center justify-between px-1 text-sm text-neutral-600">
        <span>Page {pageIndex + 1} · drag or click any text to edit it</span>
        {allReady && (
          <button type="button" onClick={onSave} className="font-bold underline hover:text-ink">
            Save as image
          </button>
        )}
      </figcaption>
    </figure>
  );
}
