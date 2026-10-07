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

/**
 * Where the user dragged a caption or balloon, as fractions of the page (0–1), so it works
 * at any size. `w` is the box width; text re-wraps to fit. Unset = placed automatically.
 */
export type LetterPos = { x: number; y: number; w: number };

export type DialogueLine = {
  speaker: string;
  side: Side;
  kind: BalloonKind;
  text: string;
  pos?: LetterPos;
};

/** One person in a panel: which age they are, what they're wearing here, how they feel. */
export type PanelCast = {
  name: string;
  /** Life stage id from the Character Bible (e.g. "child"); empty = their main look. */
  stage: string;
  /** Clothes for THIS scene (school uniform, wedding sherwani, gym kit…). Identity never changes. */
  wardrobe: string;
  emotion: string;
  action: string;
};

/**
 * Structured context worked out by the Comic Director for every panel, so each picture is built
 * from facts (who, where, when, what they wear) instead of being reinvented panel by panel.
 */
export type SceneContext = {
  location: string;
  /** Year or era, e.g. "2016", "1958", "college years". */
  period: string;
  timeOfDay: string;
  weather: string;
  event: string;
  cast: PanelCast[];
  objects: string[];
  /** What must match the previous panel (props in hand, injuries, mess, lighting). */
  continuity: string;
};

export type Panel = {
  shot: Shot;
  scene: string;
  caption: string;
  captionPos?: LetterPos;
  dialogue: DialogueLine[];
  context?: SceneContext;
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

/** Title typefaces for covers, picked to suit each comic's theme. */
export const COVER_FONTS = ["bangers", "bebas", "playfair", "marker", "abril", "cinzel"] as const;
export type CoverFont = (typeof COVER_FONTS)[number];

/** How the cover's title is lettered, chosen by the cover art director. */
export type CoverDesign = {
  concept: string;
  /** e.g. "symbolic", "dramatic-moment" */
  approach?: string;
  titleFont: CoverFont;
  titleFill: string;
  titleOutline: string;
  titlePosition: "top" | "bottom";
};

export type ComicScript = {
  title: string;
  tagline: string;
  bible: StoryBible | null;
  characters: Character[];
  /** The chosen cover (scene + design) and the alternative ideas the art director proposed. */
  cover: { scene: string; design?: CoverDesign; options?: { scene: string; design: CoverDesign }[] } | null;
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

export type CharacterDesign = { file: string; approved: boolean; needsRedraw?: boolean };

/**
 * What makes someone recognisable in every style, at every age and in any outfit.
 * Clothes are deliberately NOT part of identity: they change with the scene.
 */
export type Identity = {
  face: string;
  skin: string;
  hair: string;
  body: string;
  /** Things that make them instantly recognisable: glasses, a moustache, a scar, a bindi… */
  markers: string[];
};

/**
 * An age at which a character appears, only when the story spans years (childhood → college → wedding).
 * The member's own design is their main stage; extra stages get their own approved design.
 */
export type LifeStage = {
  id: string;
  label: string;
  ageRange: string;
  /** How they look at this age: height, face, hair at the time. */
  look: string;
  design?: CharacterDesign;
  designAttempts: number;
  lastDesignRequestId?: string;
};

/** A person in the comic: their Character Bible entry, set up in the Characters step. */
export type CastMember = {
  id: string;
  name: string;
  role: string;
  /** How they look; after a design is approved, this describes the approved design. */
  description: string;
  identity?: Identity;
  /** Label for the main design's age, e.g. "Adult (late 20s)". */
  mainStage?: { label: string; ageRange: string };
  /** Other ages they appear at (empty when the story doesn't span years). */
  stages?: LifeStage[];
  /** What they typically wear and when (work, home, festivals…); the director picks per scene. */
  wardrobe?: string;
  importance: Importance;
  source: CastSource;
  photos: string[];
  photoCheck?: { verdict: PhotoVerdict; message: string };
  /** Current design file (main stage) and whether the user approved it. */
  design?: CharacterDesign;
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
  return cast
    .filter(needsDesign)
    .every((member) => member.design?.approved && (member.stages ?? []).every((stage) => stage.design?.approved));
}

export const MAX_STAGES_PER_CHARACTER = 4;

/**
 * After writing, a comic waits in "storyboard" until the user approves it; then it moves to
 * "drawing". Comics made before the storyboard existed have no stage and go straight to drawing.
 */
export type ComicStage = "storyboard" | "drawing";

export type CostItem = "cast" | "photo-check" | "character-design" | "design-description" | "script" | "picture" | "redraw";

/** One measured AI call: who served it, which model, what it did, and what it cost. */
export type CostUsage = {
  provider: "anthropic" | "openai";
  model: string;
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Image calls: size, quality and how many reference pictures were sent. */
  image?: { size: string; quality: string; references: number };
  /** Times the call was retried after a rate limit (retries don't cost extra, but slow things down). */
  retries?: number;
  usd: number;
};

export type CostEntry = { item: CostItem; usd: number; at: string; detail?: string; usage?: CostUsage[] };

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
  stage?: ComicStage;
  /** How many single pictures the user has asked us to redraw (for limits and pricing later). */
  redraws?: number;
  /** Every paid AI call made for this comic, with its estimated price (see src/lib/costs.ts). */
  costLog?: CostEntry[];
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
