"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CastCommand } from "@/lib/cast-service";
import { castFileUrl, MAX_CAST_MEMBERS, MAX_DESIGN_ATTEMPTS, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_CHARACTER, MAX_STAGES_PER_CHARACTER, needsDesign, type CastMember, type CastState, type LifeStage } from "@/lib/comic";
import { COPY } from "@/lib/copy";
import { getStyle } from "@/lib/styles";
import Countdown, { ESTIMATES } from "./Countdown";
import Stepper from "./Stepper";

type Fields = Pick<CastMember, "name" | "role" | "description" | "importance" | "source">;
const button = "rounded border-2 border-ink bg-white px-4 py-2 font-bold hover:bg-pop disabled:cursor-not-allowed disabled:opacity-50";
const input = "w-full rounded border-2 border-ink px-3 py-2 focus:outline-none focus:ring-4 focus:ring-pop disabled:opacity-60";

async function responseData<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}

export default function CharacterStudio({ comicId, styleId, initialState }: { comicId: string; styleId: string; initialState: CastState }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(initialState.cast === null);
  const [adding, setAdding] = useState(false);
  const [starting, setStarting] = useState(false);
  const [unsaved, setUnsaved] = useState<string[]>([]);
  const [castStartedAt] = useState(() => Date.now());
  const pendingRef = useRef(false);
  const mounted = useRef(true);
  const endpoint = `/api/comics/${comicId}/cast`;
  const busy = pending || !!state.activity || starting;

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    async function restore() {
      try {
        const current = await responseData<CastState>(await fetch(endpoint, { cache: "no-store" }));
        if (cancelled) return;
        if (current.status !== "draft") { router.replace(`/comic/${comicId}/storyboard`); return; }
        if (current.cast === null && !current.activity) {
          const initialized = await responseData<CastState>(await fetch(endpoint, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "initialize" }),
          }));
          if (!cancelled) setState(initialized);
        } else setState(current);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }
    void restore();
    return () => { cancelled = true; mounted.current = false; };
  }, [endpoint, comicId, router]);

  // Restore a request that was still running when the page was refreshed.
  useEffect(() => {
    if (!state.activity) return;
    const timer = setInterval(async () => {
      try {
        const fresh = await responseData<CastState>(await fetch(endpoint, { cache: "no-store" }));
        if (mounted.current) {
          setState(fresh);
          if (fresh.status !== "draft") router.replace(`/comic/${comicId}/storyboard`);
        }
      } catch { /* A transient poll failure leaves the saved progress visible. */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [state.activity, endpoint, comicId, router]);

  async function act(body: CastCommand | FormData): Promise<CastState | null> {
    if (pendingRef.current) return null;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const form = body instanceof FormData;
      const updated = await responseData<CastState>(await fetch(endpoint, {
        method: "POST", headers: form ? undefined : { "Content-Type": "application/json" },
        body: form ? body : JSON.stringify(body),
      }));
      if (mounted.current) setState(updated);
      return updated;
    } catch (err) {
      if (mounted.current) {
        setError((err as Error).message);
        // A photo check may have succeeded even if drawing failed afterwards.
        try { setState(await responseData<CastState>(await fetch(endpoint, { cache: "no-store" }))); } catch { /* retain current state */ }
      }
      return null;
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  }

  async function startComic() {
    if (busy || !state.ready || unsaved.length > 0 || adding) return;
    setStarting(true);
    setError(null);
    try {
      await responseData(await fetch(`/api/comics/${comicId}`, { method: "POST" }));
      // Step 4: the storyboard is written and reviewed there. Nothing is drawn before approval.
      router.push(`/comic/${comicId}/storyboard`);
    } catch (err) { setError((err as Error).message); setStarting(false); }
  }

  function changed(id: string, dirty: boolean) {
    setUnsaved((current) => dirty ? [...new Set([...current, id])] : current.filter((value) => value !== id));
  }

  return (
    <div className="space-y-8">
      <Stepper current="Characters" />
      <section className="comic-box space-y-3 bg-white p-6">
        <p className="text-sm font-bold uppercase tracking-widest text-neutral-600">{getStyle(styleId)?.label} · Cast studio</p>
        <h1 className="font-title text-4xl tracking-wide sm:text-5xl">{COPY.characters.title}</h1>
        <p className="max-w-3xl text-lg text-neutral-700">{COPY.characters.intro}</p>
        <p className="text-sm text-neutral-600">Minor characters can be drawn from their descriptions. Your progress is saved at this link.</p>
      </section>

      {error && <div role="alert" className="rounded border-2 border-zap bg-red-50 p-4 font-bold text-zap">{error}</div>}
      {state.activity && <p role="status" className="rounded border-2 border-ink bg-pop p-3 font-bold">Finishing your saved request… Your characters will update here.</p>}

      {state.cast === null ? (
        <section className="comic-box space-y-4 bg-white p-8 text-center" aria-busy={initializing || busy}>
          <h2 className="font-title text-3xl">{initializing || busy ? "Finding the people in your story…" : "Let's find your cast"}</h2>
          {(initializing || busy) && <p className="text-neutral-600">Reading your story: <Countdown startedAt={castStartedAt} seconds={ESTIMATES.findCast} /></p>}
          {!initializing && !busy && <button className={button} onClick={() => act({ action: "initialize" })}>Try again</button>}
        </section>
      ) : (
        <>
          <div className="grid items-start gap-6 lg:grid-cols-2">
            {state.cast.map((member) => (
              <CharacterCard
                key={`${member.id}/${JSON.stringify([member.name, member.role, member.description, member.source, member.importance])}`}
                member={member} comicId={comicId} busy={busy} act={act} onDirty={changed} onError={setError}
              />
            ))}
          </div>
          {state.cast.length === 0 && !adding && <p className="text-center text-neutral-600">No people were detected. Add anyone who should appear, or continue with a comic about the setting.</p>}
          {adding ? <AddCharacter busy={busy} act={act} onClose={() => setAdding(false)} /> : (
            <button className={button} disabled={busy || state.cast.length >= MAX_CAST_MEMBERS} onClick={() => setAdding(true)}>+ Add a character ({state.cast.length}/{MAX_CAST_MEMBERS})</button>
          )}
          <section className="comic-box space-y-3 bg-white p-6 text-center">
            <p className="font-bold">{state.ready ? "Your cast is ready." : "Approve every main and supporting character to continue."}</p>
            {(unsaved.length > 0 || adding) && <p className="text-sm text-neutral-600">Save or cancel your character edits before continuing.</p>}
            <button className="comic-box bg-zap px-8 py-3 font-title text-3xl tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !state.ready || unsaved.length > 0 || adding} onClick={startComic}>
              {starting ? "Starting…" : COPY.characters.continue}
            </button>
          </section>
        </>
      )}
    </div>
  );
}

type Action = (command: CastCommand | FormData) => Promise<CastState | null>;
type Working = { label: string; startedAt: number; seconds: number };

function CharacterCard({ member, comicId, busy, act, onDirty, onError }: { member: CastMember; comicId: string; busy: boolean; act: Action; onDirty: (id: string, dirty: boolean) => void; onError: (error: string | null) => void }) {
  const original: Fields = { name: member.name, role: member.role, description: member.description, importance: member.importance, source: member.source };
  const [fields, setFields] = useState(original);
  const [feedback, setFeedback] = useState("");
  const [working, setWorking] = useState<Working | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const designRequest = useRef<Extract<CastCommand, { action: "design" }> | null>(null);
  const dirty = JSON.stringify(fields) !== JSON.stringify(original);
  const remaining = MAX_DESIGN_ATTEMPTS - member.designAttempts;
  const awaitingApproval = !!member.design && !member.design.approved && !member.design.needsRedraw;

  function update(patch: Partial<Fields>) {
    const next = { ...fields, ...patch };
    setFields(next);
    onDirty(member.id, JSON.stringify(next) !== JSON.stringify(original));
    designRequest.current = null;
  }
  async function perform(label: string, seconds: number, command: CastCommand | FormData) {
    setWorking({ label, startedAt: Date.now(), seconds });
    const result = await act(command);
    setWorking(null);
    return result;
  }
  async function save() {
    if (await perform("Saving details…", 5, { action: "update", memberId: member.id, changes: fields })) onDirty(member.id, false);
  }
  /** Switching between photos and AI applies straight away, so the photo upload appears immediately. */
  async function switchSource(source: Fields["source"]) {
    if (await perform("Saving…", 5, { action: "update", memberId: member.id, changes: { ...fields, source } })) onDirty(member.id, false);
  }
  async function design(current: CastMember = member, note = feedback.trim()) {
    // Reuse the same request id when retrying, so a lost response never pays for a second drawing.
    let request = designRequest.current;
    if (!request || request.expectedDesign !== current.design?.file || request.feedback !== note) {
      request = { action: "design", memberId: current.id, requestId: crypto.randomUUID(), expectedDesign: current.design?.file, feedback: note };
      designRequest.current = request;
    }
    if (await perform("Drawing your character", ESTIMATES.characterDesign, request)) { designRequest.current = null; setFeedback(""); }
  }
  /**
   * Approving the main look also draws every other age the story needs (from this look), so they
   * are ready to approve without anyone having to ask for them.
   */
  async function approveMain() {
    const approved = await perform("Approving this look", ESTIMATES.approve, { action: "approve", memberId: member.id, file: member.design!.file });
    const after = approved?.cast?.find((m) => m.id === member.id);
    for (const stage of after?.stages ?? []) {
      if (stage.design && !stage.design.needsRedraw) continue;
      if (stage.designAttempts >= MAX_DESIGN_ATTEMPTS) continue;
      const drawn = await perform(`Drawing ${member.name} · ${stage.label}`, ESTIMATES.characterDesign, {
        action: "design", memberId: member.id, stageId: stage.id, requestId: crypto.randomUUID(), expectedDesign: stage.design?.file, feedback: "",
      });
      if (!drawn) break;
    }
  }
  /** Upload → the AI checks the photos → if they're usable, it designs the character straight away. */
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (member.photos.length + files.length > MAX_PHOTOS_PER_CHARACTER) { onError("Upload at most four photos per character."); return; }
    if ([...files].some((file) => file.size > MAX_PHOTO_BYTES)) { onError("Each photo must be under 10 MB."); return; }
    const form = new FormData();
    form.append("memberId", member.id);
    for (const file of files) form.append("photos", file);
    designRequest.current = null;
    if (!(await perform("Saving your photos", 10, form))) return;
    const checked = await perform("Checking your photos", ESTIMATES.photoCheck, { action: "check-photos", memberId: member.id });
    const after = checked?.cast?.find((m) => m.id === member.id);
    if (after?.photoCheck && after.photoCheck.verdict !== "unusable" && after.designAttempts < MAX_DESIGN_ATTEMPTS) {
      await design(after, "");
    }
  }

  return (
    <section className={`comic-box space-y-4 bg-white p-5 ${awaitingApproval ? "ring-4 ring-pop" : ""}`} aria-label={`${member.name}, character`} aria-busy={!!working}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-title text-3xl tracking-wide">{member.name}</h2>
        <span className={`rounded-full border-2 px-3 py-1 text-xs font-bold ${member.design?.approved ? "border-green-700 bg-green-50 text-green-800" : awaitingApproval ? "border-ink bg-pop" : "border-ink bg-paper"}`}>{member.design?.approved ? "✓ Approved" : awaitingApproval ? "Waiting for your approval" : needsDesign(member) ? "Design needed" : "Description is enough"}</span>
      </div>
      <CharacterFields fields={fields} update={update} onSourceChange={switchSource} disabled={busy} id={member.id} />
      {dirty && <div className="flex flex-wrap items-center gap-2">
        <button className={button} disabled={busy || !fields.name.trim() || !fields.role.trim() || !fields.description.trim()} onClick={save}>Save details</button>
        <button className={button} disabled={busy} onClick={() => { setFields(original); onDirty(member.id, false); }}>Cancel edits</button>
        <p className="text-xs text-neutral-600">Appearance or reference changes need approval again.</p>
      </div>}

      {member.source === "photos" && <div className="space-y-3 rounded border-2 border-ink bg-paper p-4">
        <p className="text-sm font-bold">📷 Upload 1–4 clear photos of {member.name}, with their face visible. We&apos;ll check them and then design the character for you.</p>
        {member.photos.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {member.photos.map((file, i) => <div key={file} className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- private local reference photo */}
            <img src={castFileUrl(comicId, file)} alt={`${member.name}, reference photo ${i + 1}`} className="aspect-square w-full rounded border-2 border-ink object-cover" />
            <button className="text-xs font-bold underline disabled:opacity-50" disabled={busy || dirty} onClick={() => perform("Removing photo…", 5, { action: "remove-photo", memberId: member.id, file })}>Remove photo {i + 1}</button>
          </div>)}
        </div>}
        {member.photos.length < MAX_PHOTOS_PER_CHARACTER && <label className={`inline-flex cursor-pointer items-center gap-2 rounded border-2 border-ink bg-pop px-4 py-2 font-bold shadow-[3px_3px_0_#111] hover:-translate-y-0.5 ${busy || dirty ? "pointer-events-none opacity-50" : ""}`}>
          {member.photos.length === 0 ? "📷 Upload photos" : "📷 Add more photos"} ({member.photos.length}/{MAX_PHOTOS_PER_CHARACTER})
          <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy || dirty} onChange={(event) => { void upload(event.target.files); event.target.value = ""; }} className="sr-only" />
        </label>}
        <p className="text-xs text-neutral-600">JPEG, PNG or WebP, under 10 MB each. Photos are only used to draw this character.</p>
        {member.photos.length > 0 && !working && <button className="text-sm font-bold underline disabled:opacity-50" disabled={busy || dirty} onClick={() => perform("Checking your photos", ESTIMATES.photoCheck, { action: "check-photos", memberId: member.id })}>{member.photoCheck ? "Check photos again" : "Check my photos"}</button>}
        {member.photoCheck && <p role="status" className={`rounded border-2 p-3 text-sm ${member.photoCheck.verdict === "unusable" ? "border-zap bg-red-50" : member.photoCheck.verdict === "need-more" ? "border-amber-700 bg-amber-50" : "border-green-700 bg-green-50"}`}>{member.photoCheck.message}{member.photoCheck.verdict === "need-more" && <span className="mt-1 block font-bold">You can continue with these photos.</span>}</p>}
      </div>}

      {working && <p role="status" className="flex flex-wrap items-center gap-2 rounded border-2 border-ink bg-pop p-3 text-sm font-bold">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink border-t-white" />
        {working.label}… <Countdown startedAt={working.startedAt} seconds={working.seconds} className="font-normal" />
      </p>}

      {(needsDesign(member) || member.design) && <div className="space-y-3 border-t-2 border-ink pt-4">
        {member.mainStage && <p className="text-sm font-bold">Main version · {member.mainStage.label}{/\d/.test(member.mainStage.ageRange) && !member.mainStage.label.includes(member.mainStage.ageRange) ? ` · age ~${member.mainStage.ageRange}` : ""}</p>}
        {member.design && <>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated private design sheet */}
          <img src={castFileUrl(comicId, member.design.file)} alt={`Character design for ${member.name}`} className={`aspect-[3/2] w-full rounded border-2 border-ink bg-paper object-contain ${member.design.needsRedraw ? "opacity-50" : ""}`} />
          {member.design.needsRedraw && <p className="text-sm font-bold">The details changed since this design. Draw a new one to approve it.</p>}
          {awaitingApproval && <div className="space-y-2 rounded border-3 border-ink bg-pop p-4 text-center">
            <p className="font-bold">Happy with how {member.name} looks?</p>
            <button className="comic-box w-full animate-pulse bg-zap px-6 py-3 font-title text-2xl tracking-wide text-white hover:animate-none disabled:animate-none disabled:opacity-50" disabled={busy || dirty} onClick={approveMain}>✓ Approve this look</button>
            {(member.stages ?? []).length > 0 && <p className="text-xs">Then we&apos;ll draw {member.name} at {(member.stages ?? []).map((stage) => stage.label.toLowerCase()).join(", ")} from this look.</p>}
            <p className="text-xs">Or describe a change below and draw a revised look.</p>
          </div>}
          {remaining > 0 && <label className="block space-y-1 text-sm font-bold">
            <span>What should change?</span>
            <textarea value={feedback} onChange={(event) => { setFeedback(event.target.value); designRequest.current = null; }} maxLength={1500} rows={2} placeholder="For example: round glasses and a blue jacket" disabled={busy || dirty} className={input} />
          </label>}
        </>}
        {remaining > 0 && <button className={member.design ? button : `${button} bg-pop`} disabled={busy || dirty || (member.source === "photos" && (member.photos.length === 0 || member.photoCheck?.verdict === "unusable"))} onClick={() => design()}>{member.design ? "Draw a revised look" : member.source === "photos" ? "Design from my photos" : "✨ Design this character"}</button>}
        <p className="text-xs text-neutral-600">{remaining > 0 ? `${remaining} of ${MAX_DESIGN_ATTEMPTS} designs remaining. A design takes about ${ESTIMATES.characterDesign} seconds. Failed requests don't use an attempt.` : "All six designs used. You can still approve the current look."}</p>
        {member.wardrobe && <p className="rounded bg-paper p-2 text-xs text-neutral-700">👕 Outfits change with each scene (school, work, wedding…); the design shows who {member.name} is. Typical wardrobe: {member.wardrobe}</p>}
      </div>}
      {needsDesign(member) && <LifeStages member={member} comicId={comicId} busy={busy || dirty || !!working} act={act} />}
      {confirmRemove ? <div className="flex flex-wrap items-center gap-2 border-t-2 border-neutral-200 pt-3">
        <span className="text-sm">Remove {member.name} from the cast?</span>
        <button className={button} disabled={busy} onClick={async () => { if (await perform("Removing character…", 5, { action: "remove", memberId: member.id })) onDirty(member.id, false); }}>Remove</button>
        <button className={button} disabled={busy} onClick={() => setConfirmRemove(false)}>Keep character</button>
      </div> : <button className="text-xs text-neutral-600 underline disabled:opacity-50" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove character</button>}
    </section>
  );
}

function CharacterFields({ fields, update, onSourceChange, disabled, id }: { fields: Fields; update: (patch: Partial<Fields>) => void; onSourceChange?: (source: Fields["source"]) => void; disabled: boolean; id: string }) {
  return <fieldset disabled={disabled} className="space-y-3">
    <label className="block space-y-1 text-sm font-bold" htmlFor={`${id}-name`}>Name<input id={`${id}-name`} value={fields.name} maxLength={100} onChange={(event) => update({ name: event.target.value })} className={input} /></label>
    <label className="block space-y-1 text-sm font-bold" htmlFor={`${id}-role`}>Role in the story<textarea id={`${id}-role`} value={fields.role} maxLength={200} rows={2} onChange={(event) => update({ role: event.target.value })} className={`${input} resize-y`} /></label>
    <label className="block space-y-1 text-sm font-bold" htmlFor={`${id}-description`}>Appearance<textarea id={`${id}-description`} value={fields.description} maxLength={2000} rows={4} onChange={(event) => update({ description: event.target.value })} className={`${input} resize-y`} /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm font-bold" htmlFor={`${id}-importance`}>Importance<select id={`${id}-importance`} value={fields.importance} onChange={(event) => update({ importance: event.target.value as Fields["importance"] })} className={input}><option value="main">Main character</option><option value="supporting">Supporting character</option><option value="minor">Minor character</option></select></label>
      <label className="space-y-1 text-sm font-bold" htmlFor={`${id}-source`}>How to design them<select id={`${id}-source`} value={fields.source} onChange={(event) => { const source = event.target.value as Fields["source"]; if (onSourceChange) onSourceChange(source); else update({ source }); }} className={input}><option value="ai">✨ Let AI suggest a look</option><option value="photos">📷 Upload my photos</option></select></label>
    </div>
  </fieldset>;
}

function AddCharacter({ busy, act, onClose }: { busy: boolean; act: Action; onClose: () => void }) {
  const [fields, setFields] = useState<Fields>({ name: "", role: "", description: "", importance: "supporting", source: "ai" });
  return <section className="comic-box space-y-4 bg-white p-5">
    <h2 className="font-title text-3xl">Add a character</h2>
    <CharacterFields id="new-character" fields={fields} update={(patch) => setFields((current) => ({ ...current, ...patch }))} disabled={busy} />
    <div className="flex gap-3">
      <button className={button} disabled={busy || !fields.name.trim() || !fields.role.trim() || !fields.description.trim()} onClick={async () => { if (await act({ action: "add", member: fields })) onClose(); }}>Save character</button>
      <button className={button} disabled={busy} onClick={onClose}>Cancel</button>
    </div>
  </section>;
}

/**
 * The other ages a character appears at, inferred from the story when the cast is planned.
 * Only shown when the story actually spans years: no empty age UI otherwise.
 */
function LifeStages({ member, comicId, busy, act }: { member: CastMember; comicId: string; busy: boolean; act: Action }) {
  const stages = member.stages ?? [];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ label: "", ageRange: "", look: "", outfit: "" });
  const mainApproved = !!member.design?.approved;
  if (stages.length === 0) return null;
  return (
    <div className="space-y-3 border-t-2 border-ink pt-4">
      <div className="space-y-1">
        <p className="font-title text-2xl tracking-wide">{COPY.characters.agesTitle(member.name)}</p>
        <p className="text-xs text-neutral-600">{COPY.characters.agesIntro(member.name)}</p>
        <ul className="flex flex-wrap gap-2 pt-1 text-sm" aria-label={`Ages the story needs for ${member.name}`}>
          <li className="rounded-full border-2 border-ink bg-white px-3 py-0.5 font-bold">
            {member.design?.approved ? "✓" : "○"} Main{member.mainStage ? ` · ${member.mainStage.label}` : ""}
          </li>
          {stages.map((stage) => (
            <li key={stage.id} className={`rounded-full border-2 px-3 py-0.5 font-bold ${stage.design?.approved ? "border-green-700 bg-green-50 text-green-800" : "border-ink bg-paper"}`}>
              {stage.design?.approved ? "✓" : stage.design && !stage.design.needsRedraw ? "◐" : "○"} {stage.label}{/\d/.test(stage.ageRange) && !stage.label.includes(stage.ageRange) ? ` · ~${stage.ageRange}` : ""}
            </li>
          ))}
        </ul>
      </div>
      {!mainApproved && <p className="rounded bg-paper p-2 text-sm">Approve the main look and we&apos;ll draw these ages from it straight away.</p>}
      {stages.map((stage) => <StageCard key={`${stage.id}/${stage.look}/${stage.ageRange}`} member={member} stage={stage} comicId={comicId} busy={busy} mainApproved={mainApproved} act={act} />)}
      {adding ? (
        <div className="space-y-2 rounded border-2 border-ink bg-paper p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Chapter, e.g. College" className={input} maxLength={80} />
            <input value={draft.ageRange} onChange={(e) => setDraft({ ...draft, ageRange: e.target.value })} placeholder="Age, e.g. 19" className={input} maxLength={40} />
          </div>
          <textarea value={draft.look} onChange={(e) => setDraft({ ...draft, look: e.target.value })} placeholder="How they look then (height, face, hair at the time)" rows={2} className={input} maxLength={1500} />
          <input value={draft.outfit} onChange={(e) => setDraft({ ...draft, outfit: e.target.value })} placeholder="What they usually wore then (optional)" className={input} maxLength={600} />
          <div className="flex gap-2">
            <button className={button} disabled={busy || !draft.label.trim() || !draft.ageRange.trim() || !draft.look.trim()} onClick={async () => { if (await act({ action: "stage-add", memberId: member.id, stage: { ...draft, outfit: draft.outfit.trim() || undefined } })) { setAdding(false); setDraft({ label: "", ageRange: "", look: "", outfit: "" }); } }}>Add this age</button>
            <button className={button} disabled={busy} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        stages.length < MAX_STAGES_PER_CHARACTER && <button className="text-xs font-bold underline disabled:opacity-50" disabled={busy} onClick={() => setAdding(true)}>+ Add another age</button>
      )}
    </div>
  );
}

function StageCard({ member, stage, comicId, busy, mainApproved, act }: { member: CastMember; stage: LifeStage; comicId: string; busy: boolean; mainApproved: boolean; act: Action }) {
  const [look, setLook] = useState(stage.look);
  const [feedback, setFeedback] = useState("");
  const [working, setWorking] = useState<Working | null>(null);
  const request = useRef<Extract<CastCommand, { action: "design" }> | null>(null);
  const remaining = MAX_DESIGN_ATTEMPTS - stage.designAttempts;
  const awaiting = !!stage.design && !stage.design.approved && !stage.design.needsRedraw;
  const changed = look.trim() !== stage.look;

  async function perform(label: string, seconds: number, command: CastCommand) {
    setWorking({ label, startedAt: Date.now(), seconds });
    const result = await act(command);
    setWorking(null);
    return result;
  }
  async function design() {
    const note = feedback.trim();
    if (!request.current || request.current.expectedDesign !== stage.design?.file || request.current.feedback !== note) {
      request.current = { action: "design", memberId: member.id, stageId: stage.id, requestId: crypto.randomUUID(), expectedDesign: stage.design?.file, feedback: note };
    }
    if (await perform(`Drawing ${member.name} · ${stage.label}`, ESTIMATES.characterDesign, request.current)) {
      request.current = null;
      setFeedback("");
    }
  }

  return (
    <div className={`space-y-2 rounded border-2 bg-white p-3 ${awaiting ? "border-ink ring-4 ring-pop" : "border-neutral-300"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">{stage.label} <span className="font-normal text-neutral-600">· age {stage.ageRange}</span></p>
        <span className={`rounded-full border-2 px-2 py-0.5 text-xs font-bold ${stage.design?.approved ? "border-green-700 bg-green-50 text-green-800" : awaiting ? "border-ink bg-pop" : "border-ink bg-paper"}`}>
          {stage.design?.approved ? "✓ Approved" : awaiting ? "Waiting for your approval" : "Design needed"}
        </span>
      </div>
      <textarea value={look} onChange={(e) => setLook(e.target.value)} rows={2} maxLength={1500} disabled={busy} className={`${input} resize-y text-sm`} aria-label={`How ${member.name} looks at this age`} />
      {stage.outfit && <p className="text-xs text-neutral-600">👕 Usually wears: {stage.outfit}</p>}
      {changed && <button className={button} disabled={busy || !look.trim()} onClick={() => perform("Saving", 5, { action: "stage-update", memberId: member.id, stageId: stage.id, changes: { look: look.trim() } })}>Save</button>}
      {stage.design && <>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated private design sheet */}
        <img src={castFileUrl(comicId, stage.design.file)} alt={`${member.name} as ${stage.label}`} className={`aspect-[3/2] w-full rounded border-2 border-ink bg-paper object-contain ${stage.design.needsRedraw ? "opacity-50" : ""}`} />
        {stage.design.needsRedraw && <p className="text-sm font-bold">The main look or details changed. Draw this age again to approve it.</p>}
        {awaiting && (
          <button className="comic-box w-full animate-pulse bg-zap px-4 py-2 font-title text-xl tracking-wide text-white hover:animate-none disabled:animate-none disabled:opacity-50" disabled={busy || !!working || changed} onClick={() => perform("Approving this look", ESTIMATES.approve, { action: "approve", memberId: member.id, stageId: stage.id, file: stage.design!.file })}>
            ✓ Approve {member.name} · {stage.label}
          </button>
        )}
        {remaining > 0 && <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={1} maxLength={1500} placeholder="What should change? (optional)" disabled={busy} className={`${input} text-sm`} />}
      </>}
      <div className="flex flex-wrap items-center gap-2">
        {remaining > 0 && <button className={stage.design ? button : `${button} bg-pop`} disabled={busy || !!working || !mainApproved || changed} onClick={design}>{stage.design ? "Draw a revised look" : `✨ Design ${member.name} · ${stage.label}`}</button>}
        <button className="text-xs underline disabled:opacity-50" disabled={busy || !!working} onClick={() => act({ action: "stage-remove", memberId: member.id, stageId: stage.id })}>Remove this age</button>
      </div>
      {working && <p role="status" className="flex flex-wrap items-center gap-2 rounded border-2 border-ink bg-pop p-2 text-sm font-bold">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink border-t-white" />
        {working.label}… <Countdown startedAt={working.startedAt} seconds={working.seconds} className="font-normal" />
      </p>}
    </div>
  );
}
