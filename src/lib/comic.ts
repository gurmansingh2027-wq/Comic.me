// Shared shape of a comic. Safe to import from both server and browser code.

import type { InterviewTurn } from "./interview";
import type { LayoutId } from "./layouts";

export const MIN_STORY_LENGTH = 30;
export const MAX_STORY_LENGTH = 8000;
/** Cost guards: the writer is told to stay within these. */
export const MAX_PAGES = 12;
export const MAX_PANELS = 40;

export type Side = "left" | "right";
export type BalloonKind = "speech" | "shout" | "whisper" | "thought";
export type Shot = "establishing" | "wide" | "medium" | "close-up" | "extreme close-up";

export type DialogueLine = {
  speaker: string;
  side: Side;
  kind: BalloonKind;
  text: string;
};

export type Panel = {
  shot: Shot;
  scene: string;
  caption: string;
  dialogue: DialogueLine[];
};

export type Page = {
  layout: LayoutId;
  panels: Panel[];
};

export type Character = {
  name: string;
  appearance: string;
};

export type StoryBible = {
  logline: string;
  tone: string;
  arc: string;
  voices: { name: string; voice: string }[];
};

export type ComicScript = {
  title: string;
  tagline: string;
  bible: StoryBible | null;
  characters: Character[];
  cover: { scene: string } | null;
  pages: Page[];
};

/** What we learned in the story interview, kept for the character and storyboard steps. */
export type Intake = {
  turns: InterviewTurn[];
  characters: { name: string; role: string; look: string }[];
};

export type Importance = "main" | "supporting" | "minor";
export type CastSource = "photos" | "ai";
export type PhotoVerdict = "good" | "need-more" | "unusable";

/** A person in the comic, set up in the Characters step. */
export type CastMember = {
  id: string;
  name: string;
  role: string;
  /** How they look; after a design is approved, this describes the approved design. */
  description: string;
  importance: Importance;
  source: CastSource;
  photos: string[];
  photoCheck?: { verdict: PhotoVerdict; message: string };
  /** Current design file and whether the user approved it. */
  design?: { file: string; approved: boolean; needsRedraw?: boolean };
  designAttempts: number;
  /** Makes retrying a completed design request safe after a lost response. */
  lastDesignRequestId?: string;
};

export const MAX_CAST_MEMBERS = 12;
export const MAX_PHOTOS_PER_CHARACTER = 4;
export const MAX_DESIGN_ATTEMPTS = 6;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export type CastActivity = { action: string; memberId?: string };
export type CastState = {
  cast: CastMember[] | null;
  ready: boolean;
  status: ComicStatus;
  activity?: CastActivity;
};

/** Main and supporting characters need an approved design; minor ones are drawn from their description. */
export function needsDesign(member: CastMember): boolean {
  return member.importance !== "minor";
}

export function castReady(cast: CastMember[]): boolean {
  return cast.filter(needsDesign).every((member) => member.design?.approved);
}

export type ComicStatus = "draft" | "writing" | "polishing" | "ready" | "failed";

export type Comic = {
  id: string;
  createdAt: string;
  updatedAt: string;
  styleId: string;
  story: string;
  intake?: Intake;
  cast?: CastMember[];
  status: ComicStatus;
  error?: string;
  script?: ComicScript;
};

/** Every picture in a comic has a key: "cover", or "<page>-<panel>" counting from 1 (e.g. "3-2"). */
export const IMAGE_KEY_PATTERN = /^(cover|\d{1,2}-\d)$/;

export function panelKey(pageIndex: number, panelIndex: number): string {
  return `${pageIndex + 1}-${panelIndex + 1}`;
}

export function imageKeys(script: ComicScript): string[] {
  return [
    ...(script.cover ? ["cover"] : []),
    ...script.pages.flatMap((page, p) => page.panels.map((_, i) => panelKey(p, i))),
  ];
}

export function castFileUrl(comicId: string, file: string): string {
  return `/api/comics/${comicId}/files/${file}`;
}

export function imageUrl(comicId: string, key: string): string {
  return `/api/comics/${comicId}/images/${key}`;
}

export function countPanels(script: ComicScript): number {
  return script.pages.reduce((sum, page) => sum + page.panels.length, 0);
}
