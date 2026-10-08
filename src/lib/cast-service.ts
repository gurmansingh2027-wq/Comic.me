import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { castReady, MAX_STAGES_PER_CHARACTER, MAX_CAST_MEMBERS, MAX_DESIGN_ATTEMPTS, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_CHARACTER, type CastActivity, type CastMember, type CastState, type Comic } from "./comic";
import { addCost } from "./costs";
import { metered } from "./meter";
import { fakeImagesEnabled } from "./engines/art";
import { checkPhotos, describeDesign, drawDesign, planCast } from "./engines/characters";
import { UserFacingError } from "./errors";
import { castFilePath, loadCastFile, loadComic, saveCastFile, saveComic, withComicLock } from "./storage";
import { getStyle } from "./styles";

const Fields = z.object({
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  importance: z.enum(["main", "supporting", "minor"]),
  source: z.enum(["ai", "photos"]),
});
const memberId = z.string().uuid();
const stageId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const StageFields = z.object({
  label: z.string().trim().min(1).max(80),
  ageRange: z.string().trim().min(1).max(40),
  look: z.string().trim().min(1).max(1500),
  outfit: z.string().trim().max(600).optional(),
});
export const CastCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("initialize") }),
  z.object({ action: z.literal("add"), member: Fields }),
  z.object({ action: z.literal("update"), memberId, changes: Fields.partial() }),
  z.object({ action: z.literal("remove"), memberId }),
  z.object({ action: z.literal("remove-photo"), memberId, file: z.string().max(90) }),
  z.object({ action: z.literal("check-photos"), memberId }),
  z.object({ action: z.literal("design"), memberId, stageId: stageId.optional(), requestId: z.string().uuid(), expectedDesign: z.string().max(90).optional(), feedback: z.string().trim().max(1500).optional() }),
  z.object({ action: z.literal("approve"), memberId, stageId: stageId.optional(), file: z.string().max(90) }),
  z.object({ action: z.literal("stage-add"), memberId, stage: StageFields }),
  z.object({ action: z.literal("stage-update"), memberId, stageId, changes: StageFields.partial() }),
  z.object({ action: z.literal("stage-remove"), memberId, stageId }),
]);
export type CastCommand = z.infer<typeof CastCommandSchema>;
export type PhotoUpload = { type: string; data: Buffer };

/** Decode rather than trust the extension or browser-provided MIME type. */
export async function normalizePhoto(photo: PhotoUpload): Promise<Buffer> {
  if (photo.data.length === 0 || photo.data.length > MAX_PHOTO_BYTES) {
    throw new UserFacingError("Each photo must be under 10 MB.", 413);
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
    throw new UserFacingError("Please upload JPEG, PNG or WebP photos.");
  }
  try {
    const image = sharp(photo.data, { limitInputPixels: 40_000_000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Unsupported photo");
    return await image.rotate().resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer();
  } catch {
    throw new UserFacingError("We couldn't read that photo. Try a clear JPEG, PNG or WebP image.");
  }
}

const defaultDependencies = { loadComic, saveComic, loadCastFile, saveCastFile, castFilePath, withComicLock, planCast, checkPhotos, drawDesign, describeDesign, normalizePhoto };
type Dependencies = typeof defaultDependencies;

const shared = globalThis as typeof globalThis & {
  castActivity?: Map<string, CastActivity>;
  castFlights?: Map<string, Promise<CastState>>;
};

/** Dependencies are injectable so the paid providers can be tested without API calls. */
export function createCastService(deps: Dependencies, activity = new Map<string, CastActivity>(), flights = new Map<string, Promise<CastState>>()) {
  const snapshot = (comic: Comic): CastState => ({
    cast: comic.cast ?? null,
    ready: comic.cast !== undefined && castReady(comic.cast),
    status: comic.status,
    activity: activity.get(comic.id),
  });
  async function requireComic(id: string) {
    const comic = await deps.loadComic(id);
    if (!comic) throw new UserFacingError("Comic not found.", 404);
    return comic;
  }
  function findMember(comic: Comic, id: string) {
    const member = comic.cast?.find((m) => m.id === id);
    if (!member) throw new UserFacingError("Character not found.", 404);
    return member;
  }
  function assertUnique(comic: Comic, name: string, except?: string) {
    const normalized = name.normalize("NFKC").toLowerCase();
    if (comic.cast?.some((m) => m.id !== except && m.name.normalize("NFKC").toLowerCase() === normalized)) {
      throw new UserFacingError("Give each character a different name so we can tell them apart.");
    }
  }
  function invalidate(member: CastMember, photosChanged = false) {
    if (member.design) member.design = { ...member.design, approved: false, needsRedraw: true };
    invalidateStages(member);
    if (photosChanged) member.photoCheck = undefined;
  }
  /** Other ages are drawn from the main design, so they need redrawing when it changes. */
  function invalidateStages(member: CastMember) {
    for (const stage of member.stages ?? []) {
      if (stage.design) stage.design = { ...stage.design, approved: false, needsRedraw: true };
    }
  }
  function findStage(member: CastMember, id: string) {
    const stage = member.stages?.find((s) => s.id === id);
    if (!stage) throw new UserFacingError("That age wasn't found. Refresh and try again.", 404);
    return stage;
  }
  function stageSlug(member: CastMember, label: string) {
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 30) || "stage";
    let slug = base;
    for (let n = 2; member.stages?.some((s) => s.id === slug); n++) slug = `${base}-${n}`;
    return slug;
  }
  async function photoBytes(comic: Comic, member: CastMember) {
    if (member.photos.length === 0) throw new UserFacingError("Upload at least one clear photo first.");
    return Promise.all(member.photos.map(async (file) => {
      const bytes = await deps.loadCastFile(comic.id, file);
      if (!bytes) throw new UserFacingError("A saved photo is missing. Remove it and upload it again.");
      return bytes;
    }));
  }
  async function check(comic: Comic, member: CastMember) {
    const photos = await photoBytes(comic, member);
    const { result, usage } = await metered(() => deps.checkPhotos(member, photos));
    member.photoCheck = result;
    addCost(comic, "photo-check", member.name, usage);
    await deps.saveComic(comic);
  }
  async function locked(id: string, taskActivity: CastActivity, task: (comic: Comic) => Promise<void>): Promise<CastState> {
    return deps.withComicLock(id, async () => {
      const comic = await requireComic(id);
      if (comic.status !== "draft") throw new UserFacingError("Characters are locked because this comic has started writing.", 409);
      activity.set(id, taskActivity);
      try {
        await task(comic);
        await deps.saveComic(comic);
        return { ...snapshot(comic), activity: undefined };
      } finally {
        activity.delete(id);
      }
    });
  }
  async function execute(id: string, command: CastCommand) {
    return locked(id, { action: command.action, memberId: "memberId" in command ? command.memberId : undefined }, async (comic) => {
      if (command.action === "initialize") {
        if (comic.cast !== undefined) return;
        const { result: planned, usage } = await metered(() => deps.planCast(comic.story, comic.intake));
        addCost(comic, "cast", undefined, usage);
        comic.cast = [];
        for (const person of planned.slice(0, MAX_CAST_MEMBERS)) {
          const fields = Fields.parse({ ...person, description: person.description.slice(0, 2000), source: "ai" });
          if (comic.cast.some((m) => m.name.normalize("NFKC").toLowerCase() === fields.name.normalize("NFKC").toLowerCase())) continue;
          const member: CastMember = {
            ...fields,
            id: randomUUID(),
            photos: [],
            designAttempts: 0,
            identity: person.identity,
            wardrobe: person.wardrobe,
            mainStage: person.mainStage,
            stages: [],
          };
          for (const stage of person.stages) {
            member.stages!.push({ id: stageSlug(member, stage.label), ...stage, designAttempts: 0 });
          }
          comic.cast.push(member);
        }
        return;
      }
      if (comic.cast === undefined) throw new UserFacingError("Let us find the characters in your story first.", 409);
      if (command.action === "add") {
        if (comic.cast.length >= MAX_CAST_MEMBERS) throw new UserFacingError("A comic can have at most 12 characters.");
        assertUnique(comic, command.member.name);
        comic.cast.push({ ...command.member, id: randomUUID(), photos: [], designAttempts: 0 });
        return;
      }
      const member = findMember(comic, command.memberId);
      switch (command.action) {
        case "update": {
          const updated = { ...member, ...command.changes };
          assertUnique(comic, updated.name, member.id);
          if (updated.description !== member.description || updated.source !== member.source) invalidate(updated);
          if (updated.importance !== member.importance) updated.photoCheck = undefined;
          Object.assign(member, updated);
          break;
        }
        case "remove":
          comic.cast = comic.cast.filter((m) => m.id !== member.id);
          break;
        case "remove-photo":
          if (!member.photos.includes(command.file)) throw new UserFacingError("Photo not found.", 404);
          member.photos = member.photos.filter((file) => file !== command.file);
          invalidate(member, true);
          break;
        case "check-photos":
          await check(comic, member);
          break;
        case "design": {
          const style = getStyle(comic.styleId);
          if (!style) throw new UserFacingError("This comic's style no longer exists.", 500);
          const photoPaths = member.source === "photos" ? member.photos.map((file) => deps.castFilePath(id, file)) : [];
          if (command.stageId) {
            // Another age: drawn from the approved main design so it's clearly the same person.
            const stage = findStage(member, command.stageId);
            if (stage.lastDesignRequestId === command.requestId) return;
            if (stage.design?.file !== command.expectedDesign) throw new UserFacingError("This design has changed. Refresh and try again.", 409);
            if (stage.designAttempts >= MAX_DESIGN_ATTEMPTS) throw new UserFacingError("You've used all six designs for this age. You can still approve the current one.", 409);
            if (!member.design?.approved) throw new UserFacingError(`Approve ${member.name}'s main look first; other ages are drawn from it.`, 409);
            const identityDesignPath = deps.castFilePath(id, member.design.file);
            const { result: image, usage } = await metered(() => deps.drawDesign({
              member, style, photoPaths,
              stage,
              identityDesignPath,
              previousDesignPath: stage.design && !stage.design.needsRedraw ? deps.castFilePath(id, stage.design.file) : undefined,
              feedback: command.feedback,
            }));
            const file = `${randomUUID()}.webp`;
            await deps.saveCastFile(id, file, image);
            stage.design = { file, approved: false };
            stage.designAttempts++;
            stage.lastDesignRequestId = command.requestId;
            addCost(comic, "character-design", `${member.name} · ${stage.label}`, usage);
            break;
          }
          if (member.lastDesignRequestId === command.requestId) return;
          if (member.design?.file !== command.expectedDesign) throw new UserFacingError("This design has changed. Refresh and try again.", 409);
          if (member.designAttempts >= MAX_DESIGN_ATTEMPTS) throw new UserFacingError("You've used all six designs. You can still approve the current one.", 409);
          if (member.source === "photos") {
            await photoBytes(comic, member);
            if (!member.photoCheck) await check(comic, member);
            if (member.photoCheck?.verdict === "unusable") throw new UserFacingError(member.photoCheck.message);
          }
          const { result: image, usage } = await metered(() => deps.drawDesign({
            member, style, photoPaths,
            previousDesignPath: member.design && !member.design.needsRedraw ? deps.castFilePath(id, member.design.file) : undefined,
            feedback: command.feedback,
          }));
          const file = `${randomUUID()}.webp`;
          await deps.saveCastFile(id, file, image);
          member.design = { file, approved: false };
          member.designAttempts++;
          invalidateStages(member);
          addCost(comic, "character-design", member.name, usage);
          member.lastDesignRequestId = command.requestId;
          break;
        }
        case "approve": {
          if (command.stageId) {
            const stage = findStage(member, command.stageId);
            if (stage.design?.file !== command.file) throw new UserFacingError("Approve the current design shown on this page.", 409);
            if (stage.design.approved) return;
            const image = await deps.loadCastFile(id, command.file);
            if (!image) throw new UserFacingError("The design is missing. Please generate it again.");
            // Test mode: placeholders have nothing to describe, so keep the planned look.
            const described = fakeImagesEnabled() ? { result: stage.look, usage: [] } : await metered(() => deps.describeDesign(member, image, `${stage.label}, age ${stage.ageRange}`));
            stage.look = described.result;
            addCost(comic, "design-description", `${member.name} · ${stage.label}`, described.usage);
            stage.design = { ...stage.design, approved: true, needsRedraw: false };
            break;
          }
          if (member.design?.file !== command.file) throw new UserFacingError("Approve the current design shown on this page.", 409);
          if (member.design.approved) return;
          const image = await deps.loadCastFile(id, command.file);
          if (!image) throw new UserFacingError("The design is missing. Please generate it again.");
          const described = fakeImagesEnabled()
            ? { result: member.description, usage: [] }
            : await metered(() => deps.describeDesign(member, image, member.mainStage ? `${member.mainStage.label}, age ${member.mainStage.ageRange}` : undefined));
          member.description = described.result;
          addCost(comic, "design-description", member.name, described.usage);
          member.design.approved = true;
          member.design.needsRedraw = false;
          break;
        }
        case "stage-add": {
          const stages = (member.stages ??= []);
          if (stages.length >= MAX_STAGES_PER_CHARACTER) throw new UserFacingError("A character can have at most four extra ages.");
          stages.push({ id: stageSlug(member, command.stage.label), ...command.stage, designAttempts: 0 });
          break;
        }
        case "stage-update": {
          const stage = findStage(member, command.stageId);
          Object.assign(stage, command.changes);
          if (stage.design && (command.changes.look || command.changes.ageRange)) stage.design = { ...stage.design, approved: false, needsRedraw: true };
          break;
        }
        case "stage-remove":
          member.stages = (member.stages ?? []).filter((stage) => stage.id !== command.stageId);
          break;
      }
    });
  }
  return {
    async read(id: string) { return snapshot(await requireComic(id)); },
    command(id: string, command: CastCommand): Promise<CastState> {
      if (command.action !== "design") return execute(id, command);
      const key = `${id}/${command.memberId}/${command.stageId ?? "main"}/${command.requestId}`;
      const existing = flights.get(key);
      if (existing) return existing;
      const promise = execute(id, command);
      flights.set(key, promise);
      void promise.finally(() => { if (flights.get(key) === promise) flights.delete(key); }).catch(() => {});
      return promise;
    },
    async upload(id: string, memberId: string, photos: PhotoUpload[]) {
      return locked(id, { action: "upload", memberId }, async (comic) => {
        const member = findMember(comic, memberId);
        if (photos.length === 0) throw new UserFacingError("Choose at least one photo.");
        if (member.photos.length + photos.length > MAX_PHOTOS_PER_CHARACTER) throw new UserFacingError("Upload at most four photos per character.");
        const normalized = await Promise.all(photos.map((photo) => deps.normalizePhoto(photo)));
        const files = normalized.map(() => `${randomUUID()}.jpg`);
        await Promise.all(normalized.map((data, i) => deps.saveCastFile(id, files[i], data)));
        member.photos.push(...files);
        invalidate(member, true);
      });
    },
  };
}

export const castService = createCastService(defaultDependencies, shared.castActivity ??= new Map(), shared.castFlights ??= new Map());
