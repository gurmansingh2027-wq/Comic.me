"use client";
import { useRef, useState } from "react";
import { castFileUrl, MAX_CANON_OBJECTS, MAX_DESIGN_ATTEMPTS, type CanonObject } from "@/lib/comic";
import type { CastCommand } from "@/lib/cast-service";

const input = "w-full rounded border-2 border-ink px-3 py-2";
const button = "rounded border-2 border-ink bg-white px-4 py-2 font-bold hover:bg-pop disabled:opacity-50";
type Props = { comicId: string; objects: CanonObject[]; busy: boolean; act: (command: CastCommand) => Promise<unknown>; onDirty: (id: string, dirty: boolean) => void };
export default function ObjectStudio(props: Props) {
  const [adding, setAdding] = useState(false);
  return <section className="space-y-4">
    <div><h2 className="font-title text-3xl">Important things</h2><p className="text-neutral-600">Give recurring vehicles and objects a design we can keep consistent throughout the story.</p></div>
    <div className="grid items-start gap-5 lg:grid-cols-2">{props.objects.map(object => <ObjectCard {...props} key={`${object.id}/${object.description}/${object.locks.join()}/${object.driverSide}`} object={object} />)}</div>
    {adding ? <ObjectCard {...props} onClose={() => { setAdding(false); props.onDirty("new-object", false); }} /> : <button className={button} disabled={props.busy || props.objects.length >= MAX_CANON_OBJECTS} onClick={() => { setAdding(true); props.onDirty("new-object", true); }}>+ Add an important thing</button>}
  </section>;
}
function ObjectCard({ object, onClose, ...props }: Props & { object?: CanonObject; onClose?: () => void }) {
  const [name, setName] = useState(object?.name ?? "");
  const [description, setDescription] = useState(object?.description ?? "");
  const [details, setDetails] = useState(object?.locks.join("\n") ?? "");
  const [kind, setKind] = useState<CanonObject["kind"]>(object?.kind ?? "prop");
  const [driverSide, setDriverSide] = useState(object?.driverSide ?? "");
  const [feedback, setFeedback] = useState("");
  const request = useRef<Extract<CastCommand, { action: "object-design" }> | null>(null);
  const id = object?.id ?? "new-object";
  const dirty = !object || name !== object.name || description !== object.description || details !== object.locks.join("\n") || kind !== object.kind || driverSide !== (object.driverSide ?? "");
  const changed = () => props.onDirty(id, true);
  async function save() {
    const fields = { name, description, locks: details.split("\n").map(s => s.trim()).filter(Boolean), kind, role: object?.role ?? "recurring" as const, driverSide: driverSide ? driverSide as "left" | "right" : undefined };
    if (await props.act(object ? { action: "object-update", objectId: id, changes: fields } : { action: "object-add", object: fields })) { props.onDirty(id, false); onClose?.(); }
  }
  async function design() {
    if (!object) return;
    if (!request.current || request.current.expectedDesign !== object.design?.file || request.current.feedback !== feedback) request.current = { action: "object-design", objectId: id, requestId: crypto.randomUUID(), expectedDesign: object.design?.file, feedback };
    if (await props.act(request.current)) { request.current = null; setFeedback(""); }
  }
  return <article className="comic-box space-y-3 bg-white p-5">
    <h3 className="font-title text-2xl">{object?.name ?? "Add an important thing"}{object?.design?.approved && " · Approved"}</h3>
    <fieldset disabled={props.busy} className="space-y-3">
      <label className="block text-sm font-bold">Name<input className={input} value={name} maxLength={100} onChange={e => { setName(e.target.value); changed(); }} /></label>
      <label className="block text-sm font-bold">Type<select className={input} value={kind} onChange={e => { setKind(e.target.value as CanonObject["kind"]); changed(); }}><option value="vehicle">Vehicle</option><option value="prop">Object</option><option value="creature">Creature</option><option value="place">Place</option></select></label>
      <label className="block text-sm font-bold">Appearance<textarea className={input} value={description} maxLength={2000} onChange={e => { setDescription(e.target.value); changed(); }} /></label>
      <label className="block text-sm font-bold">Details to keep the same<textarea className={input} rows={3} value={details} onChange={e => { setDetails(e.target.value); changed(); }} placeholder="One detail per line: colour, shape, markings…" /></label>
      {kind === "vehicle" && <label className="block text-sm font-bold">Driver sits on<select className={input} value={driverSide} onChange={e => { setDriverSide(e.target.value); changed(); }}><option value="">Not specified</option><option value="left">Left</option><option value="right">Right</option></select></label>}
      {dirty && <button className={button} disabled={!name.trim() || !description.trim()} onClick={save}>Save details</button>}
      {onClose && <button className={button} onClick={onClose}>Cancel</button>}
    </fieldset>
    {object?.design && <>
      {/* eslint-disable-next-line @next/next/no-img-element -- private approved reference sheet */}
      <img src={castFileUrl(props.comicId, object.design.file)} alt={`Design of ${object.name}`} className="aspect-[3/2] w-full rounded border-2 object-contain" />
      {object.design.needsRedraw && <p className="text-sm">Details changed. Draw a revised design before approving.</p>}
      {!object.design.approved && !object.design.needsRedraw && <button className={`${button} bg-pop`} disabled={props.busy || dirty} onClick={() => props.act({ action: "object-approve", objectId: id, file: object.design!.file })}>Approve this design</button>}
    </>}
    {object && <>
      {object.design && <label className="block text-sm">What should change?<textarea className={input} maxLength={1500} value={feedback} onChange={e => setFeedback(e.target.value)} disabled={props.busy || dirty} /></label>}
      <button className={button} disabled={props.busy || dirty || object.designAttempts >= MAX_DESIGN_ATTEMPTS} onClick={design}>{object.design ? "Draw a revised design" : "Design this thing"}</button>
      <p className="text-xs text-neutral-600">{Math.max(0, MAX_DESIGN_ATTEMPTS - object.designAttempts)} designs remaining.</p>
      <button className="text-xs underline" disabled={props.busy} onClick={async () => { if (await props.act({ action: "object-remove", objectId: id })) props.onDirty(id, false); }}>Remove from story</button>
    </>}
  </article>;
}
