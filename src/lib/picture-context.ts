import "server-only";
import { identityOnly, panelKey, type CanonObject, type Comic } from "./comic";
import { buildLedger, type LedgerEntry } from "./continuity";
import type { CastRef, ObjectRef } from "./engines/art";
import type { QaReference } from "./qa/visual-qa";
import { castFilePath, hasImage, imagePath, loadCastFile, loadImage } from "./storage";

// Everything a picture is drawn and checked against: the approved character designs, the Object
// Bible with its canon sheets, and the Continuity Ledger. Shared by drawing and visual QA so both
// see exactly the same facts.

export function castRefsFor(comic: Comic): CastRef[] {
  return (comic.cast ?? [])
    .filter((member) => member.design?.approved)
    .map((member) => ({
      name: member.name,
      description: identityOnly(member.description),
      importance: member.importance,
      designPath: castFilePath(comic.id, member.design!.file),
      stages: (member.stages ?? []).map((stage) => ({
        id: stage.id,
        label: stage.label,
        look: identityOnly(stage.look),
        designPath: stage.design?.approved ? castFilePath(comic.id, stage.design.file) : undefined,
      })),
    }));
}

export function objectRefsFor(comic: Comic, objects: CanonObject[] = comic.objects ?? []): ObjectRef[] {
  return objects.map((object) => ({
    id: object.id,
    name: object.name,
    kind: object.kind,
    role: object.role,
    owner: object.owner,
    description: object.description,
    locks: object.locks,
    driverSide: object.driverSide,
    states: object.states,
    designPath: object.design?.approved ? castFilePath(comic.id, object.design.file) : undefined,
  }));
}

export function ledgerFor(comic: Comic, objects: CanonObject[] = comic.objects ?? []) {
  return buildLedger(comic.script!, comic.cast ?? [], objects);
}

/** Previous panel of the same scene, if it has been drawn: a continuity reference for drawing and QA. */
export async function previousPanel(comic: Comic, entry: LedgerEntry | undefined): Promise<string | undefined> {
  if (!entry?.continuesFrom) return undefined;
  return (await hasImage(comic.id, entry.continuesFrom)) ? imagePath(comic.id, entry.continuesFrom) : undefined;
}

/** The reference pictures QA compares against: canon sheets of objects in frame, then people's designs (right age). */
export async function qaReferences(comic: Comic, entry: LedgerEntry | undefined, objectRefs: ObjectRef[], castRefs: CastRef[], limit = 14): Promise<QaReference[]> {
  const out: QaReference[] = [];
  const { readFile } = await import("node:fs/promises");
  for (const object of entry?.objects ?? []) {
    const ref = objectRefs.find((candidate) => candidate.id === object.id);
    if (ref?.designPath && out.length < limit) {
      const data = await readFile(ref.designPath).catch(() => null);
      if (data) out.push({ label: `canon sheet of ${ref.name} (locks: ${ref.locks.join("; ")})`, data });
    }
  }
  for (const person of entry?.people ?? []) {
    const ref = castRefs.find((candidate) => candidate.name.toLowerCase() === person.name.toLowerCase());
    const stage = person.stage ? ref?.stages?.find((s) => s.id === person.stage) : undefined;
    const path = stage ? stage.designPath : ref?.designPath;
    if (path && out.length < limit) {
      const data = await readFile(path).catch(() => null);
      if (data) out.push({ label: `design sheet of ${person.name}${stage ? ` at age stage "${stage.label}"` : ""} (${person.wardrobeFromSheet ? "copy this approved outfit" : "identity reference; clothes follow scene"})`, data });
    }
  }
  return out;
}

export async function pictureBytes(comic: Comic, key: string): Promise<Buffer | null> {
  return loadImage(comic.id, key);
}

export { loadCastFile, panelKey };
