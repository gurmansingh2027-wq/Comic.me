"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MAX_STORY_LENGTH } from "@/lib/comic";
import { INTERVIEW_GREETING, type InterviewTurn } from "@/lib/interview";
import { COMIC_STYLES } from "@/lib/styles";
import Stepper from "./Stepper";
import StylePicker from "./StylePicker";
import { audioFileName, useVoice } from "./useVoice";

type Composed = {
  title: string;
  story: string;
  characters: { name: string; role: string; look: string }[];
};

type Phase = "interview" | "composing" | "review" | "style";

type Saved = { phase: Phase; turns: InterviewTurn[]; composed: Composed | null; styleId: string };

const STORAGE_KEY = "comicme.studio.v1";
const FRESH: Saved = {
  phase: "interview",
  turns: [{ role: "ai", text: INTERVIEW_GREETING }],
  composed: null,
  styleId: COMIC_STYLES[0].id,
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

export default function StoryStudio() {
  const router = useRouter();
  const [state, setState] = useState<Saved>(FRESH);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<null | "listening" | "thinking" | "submitting">(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const voice = useVoice();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep the session across refreshes.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring saved progress once on mount
    if (saved) setState({ ...FRESH, ...JSON.parse(saved) });
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, loaded]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state.turns.length, busy]);

  const update = (patch: Partial<Saved>) => setState((current) => ({ ...current, ...patch }));
  const answers = state.turns.filter((turn) => turn.role === "user").length;

  async function compose(turns: InterviewTurn[]) {
    update({ phase: "composing" });
    try {
      const composed = await postJson<Composed>("/api/interview/compose", { turns });
      update({ phase: "review", composed });
    } catch (err) {
      setError((err as Error).message);
      update({ phase: "interview" });
    }
  }

  async function sendAnswer(text: string) {
    const turns: InterviewTurn[] = [...state.turns, { role: "user", text }];
    update({ turns });
    setBusy("thinking");
    try {
      const reply = await postJson<{ say: string; done: boolean }>("/api/interview/turn", { turns });
      const next: InterviewTurn[] = [...turns, { role: "ai", text: reply.say }];
      update({ turns: next });
      if (voiceOn) voice.say(reply.say);
      if (reply.done) await compose(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleMic() {
    setError(null);
    if (voice.recording) {
      voice.stopRecording();
      return;
    }
    let audio: Blob | null;
    try {
      audio = await voice.startRecording();
    } catch {
      setError("We couldn't use your microphone. Allow microphone access in your browser, or type your answer instead.");
      return;
    }
    if (!audio) {
      setError("We didn't catch anything. Tap the mic and try again.");
      return;
    }
    setBusy("listening");
    try {
      const form = new FormData();
      form.append("audio", audio, audioFileName(audio));
      const response = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setBusy(null);
      await sendAnswer(data.text);
    } catch (err) {
      setError((err as Error).message || "We couldn't hear that. Please try again.");
      setBusy(null);
    }
  }

  function handleTyped(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setError(null);
    voice.stopSpeaking();
    sendAnswer(text);
  }

  async function makeComic() {
    if (!state.composed) return;
    setBusy("submitting");
    setError(null);
    try {
      const story = `Working title: ${state.composed.title}\n\n${state.composed.story}`.slice(0, MAX_STORY_LENGTH);
      const { id } = await postJson<{ id: string }>("/api/comics", {
        story,
        styleId: state.styleId,
        intake: { turns: state.turns, characters: state.composed.characters },
      });
      localStorage.removeItem(STORAGE_KEY);
      router.push(`/comic/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  function startOver() {
    voice.stopSpeaking();
    setState(FRESH);
    setError(null);
  }

  if (!loaded) return null;

  const step = state.phase === "style" ? "Style" : "Your story";
  return (
    <div className="space-y-8">
      <Stepper current={step} />

      {(state.phase === "interview" || state.phase === "composing") && (
        <section className="comic-box mx-auto max-w-3xl bg-white">
          <div className="flex items-center justify-between border-b-3 border-ink px-5 py-3">
            <h1 className="font-title text-3xl tracking-wide">Tell me your story</h1>
            <button
              type="button"
              onClick={() => {
                setVoiceOn(!voiceOn);
                voice.stopSpeaking();
              }}
              className="rounded-full border-2 border-ink px-3 py-1 text-sm font-bold hover:bg-pop"
            >
              {voiceOn ? "🔊 Voice on" : "🔇 Voice off"}
            </button>
          </div>

          <div className="max-h-[55vh] space-y-4 overflow-y-auto p-5">
            {state.turns.map((turn, i) => (
              <div key={i} className={`flex ${turn.role === "ai" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl border-2 border-ink px-4 py-3 text-lg ${
                    turn.role === "ai" ? "rounded-bl-none bg-paper" : "rounded-br-none bg-pop"
                  }`}
                >
                  {turn.text}
                  {turn.role === "ai" && (
                    <button
                      type="button"
                      onClick={() => voice.say(turn.text)}
                      aria-label="Play this out loud"
                      className="ml-2 align-middle text-base opacity-60 hover:opacity-100"
                    >
                      🔊
                    </button>
                  )}
                </div>
              </div>
            ))}
            {(busy === "listening" || busy === "thinking" || state.phase === "composing") && (
              <p className="text-center text-sm font-bold text-neutral-600">
                {state.phase === "composing"
                  ? "Writing up your story… (about a minute)"
                  : busy === "listening"
                    ? "Listening back to what you said…"
                    : "Thinking of the next question…"}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {state.phase === "interview" && (
            <div className="space-y-4 border-t-3 border-ink p-5">
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handleMic}
                  disabled={busy !== null}
                  aria-label={voice.recording ? "Stop recording" : "Start talking"}
                  className={`flex h-20 w-20 items-center justify-center rounded-full border-3 border-ink text-4xl shadow-[4px_4px_0_#111] transition disabled:opacity-50 ${
                    voice.recording ? "animate-pulse bg-zap" : "bg-pop hover:-translate-y-0.5"
                  }`}
                >
                  {voice.recording ? "■" : "🎙️"}
                </button>
                <p className="text-sm font-bold">
                  {voice.recording ? "Listening… tap to stop" : voice.speaking ? "Speaking… tap the mic to answer" : "Tap to talk"}
                </p>
              </div>

              <form onSubmit={handleTyped} className="flex gap-2">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="…or type your answer"
                  className="min-w-0 flex-1 rounded border-2 border-ink px-3 py-2 focus:ring-4 focus:ring-pop focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || busy !== null}
                  className="rounded border-2 border-ink bg-white px-4 font-bold hover:bg-pop disabled:opacity-50"
                >
                  Send
                </button>
              </form>

              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <button type="button" onClick={startOver} className="underline">
                  Start over
                </button>
                {answers > 0 && (
                  <button
                    type="button"
                    onClick={() => compose(state.turns)}
                    disabled={busy !== null}
                    className="rounded border-2 border-ink bg-white px-3 py-1 font-bold hover:bg-pop disabled:opacity-50"
                  >
                    That&apos;s everything, write it up →
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {state.phase === "review" && state.composed && (
        <section className="comic-box mx-auto max-w-3xl space-y-5 bg-white p-6">
          <div>
            <h1 className="font-title text-4xl tracking-wide">Here&apos;s your story</h1>
            <p className="text-neutral-700">
              Read it through and fix anything that&apos;s not right. When you&apos;re happy, lock it in.
            </p>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-bold">Working title</span>
            <input
              value={state.composed.title}
              onChange={(event) => update({ composed: { ...state.composed!, title: event.target.value } })}
              className="w-full rounded border-2 border-ink px-3 py-2 text-lg font-bold"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-bold">Story</span>
            <textarea
              value={state.composed.story}
              onChange={(event) => update({ composed: { ...state.composed!, story: event.target.value } })}
              rows={14}
              maxLength={MAX_STORY_LENGTH - 200}
              className="w-full resize-y rounded border-2 border-ink p-3 text-lg leading-relaxed"
            />
          </label>
          {state.composed.characters.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold">Who&apos;s in it</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {state.composed.characters.map((character) => (
                  <li key={character.name} className="rounded border-2 border-neutral-300 bg-paper p-3 text-sm">
                    <span className="font-bold">{character.name}</span> · {character.role}
                    <p className="text-neutral-600">{character.look}</p>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-neutral-500">You&apos;ll set up how each person looks in the Characters step.</p>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-3">
            <button
              type="button"
              onClick={() => update({ phase: "interview" })}
              className="rounded border-2 border-ink bg-white px-4 py-2 font-bold hover:bg-pop"
            >
              ← Keep talking
            </button>
            <button
              type="button"
              onClick={() => update({ phase: "style" })}
              disabled={state.composed.story.trim().length < 30}
              className="comic-box bg-zap px-6 py-2 font-title text-2xl tracking-wide text-white disabled:opacity-50"
            >
              🔒 Lock my story
            </button>
          </div>
        </section>
      )}

      {state.phase === "style" && (
        <section className="comic-box space-y-5 bg-white p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="font-title text-4xl tracking-wide">Pick a style</h1>
            <button type="button" onClick={() => update({ phase: "review" })} className="text-sm underline">
              ← Back to my story
            </button>
          </div>
          <StylePicker value={state.styleId} onChange={(styleId) => update({ styleId })} />
          <div className="text-center">
            <button
              type="button"
              onClick={makeComic}
              disabled={busy === "submitting"}
              className="comic-box bg-zap px-10 py-4 font-title text-3xl tracking-wide text-white transition hover:-translate-y-0.5 disabled:opacity-50"
            >
              {busy === "submitting" ? "Starting…" : "Make my comic!"}
            </button>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="mx-auto max-w-3xl rounded border-2 border-zap bg-red-50 p-3 font-bold text-zap">
          {error}
        </p>
      )}
    </div>
  );
}
