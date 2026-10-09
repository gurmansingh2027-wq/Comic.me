// Shared shape of a comic. Safe to import from both server and browser code.

import type { InterviewTurn } from "./interview";
import type { LayoutId } from "./layouts";

export const MIN_STORY_LENGTH = 30;
export const MAX_STORY_LENGTH = 8000;
/** Cost guards: the writer is told to stay within these. */
export const MAX_PAGES = 12;
export const MAX_PANELS = 40;

export type Side = "left" | "right";
/** speech · shout (energetic, spiky) · whisper (small, dashed) · thought (cloud) · robot (geometric: machines, AIs, monsters). */
export const BALLOON_KINDS = ["speech", "shout", "whisper", "thought", "robot"] as const;
export type BalloonKind = (typeof BALLOON_KINDS)[number];
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
  /** What is happening: "cramming for board exams", "first dance". */
  activity?: string;
  /** Camera angle and lens: "low angle, wide lens, hero framing". */
  camera?: string;
  /** Who these people are to each other in this moment: "proud father, anxious son". */
  relationships?: string;
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
  /** A sound effect lettered big over the art ("KRAK!"), used sparingly. */
  sfx?: string;
  sfxPos?: LetterPos;
  context?: SceneContext;
  /** One of the book's 1-2 jaw-dropping moments: drawn with extra ambition (and at higher quality). */
  hero?: boolean;
  /** Why it's a hero moment (reveal, victory, first kiss, biggest joke…). */
  heroReason?: string;
};

/** Most hero panels per comic: 2 for most books, 3 for long ones. */
export function maxHeroPanels(pageCount: number): number {
  return pageCount >= 10 ? 3 : 2;
}

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

/** Title typefaces for covers, picked to suit each comic's story, genre, era and humour. */
export const COVER_FONTS = [
  "bangers",
  "bebas",
  "anton",
  "playfair",
  "bodoni",
  "fraunces",
  "marker",
  "caveat",
  "abril",
  "shrikhand",
  "cinzel",
  "bungee",
  "monoton",
  "grotesk",
  "unbounded",
] as const;
export type CoverFont = (typeof COVER_FONTS)[number];

/** How big the title is: covers don't all need a giant title (sometimes small and confident is better). */
export const TITLE_SIZES = ["huge", "large", "medium", "small"] as const;
/** How the title is lettered over the art. */
export const TITLE_TREATMENTS = ["solid", "outline", "shadow", "band", "hollow", "stacked"] as const;

/** How the cover's title is lettered, chosen by the cover art director. Drawn by our code, never by the image model. */
export type CoverDesign = {
  concept: string;
  /** The composition family, e.g. "graphic-minimal", "tiny-figure-giant-world" (older comics: "symbolic"…). */
  approach?: string;
  titleFont: CoverFont;
  titleFill: string;
  titleOutline: string;
  titlePosition: "top" | "middle" | "bottom";
  /** Newer covers: the rest of the title treatment (older covers fall back to big, centred, outlined). */
  titleSize?: (typeof TITLE_SIZES)[number];
  titleAlign?: "left" | "center" | "right";
  titleCase?: "upper" | "as-written";
  /** Letter spacing in em (−0.05 tight … 0.4 airy). */
  titleTracking?: number;
  titleTreatment?: (typeof TITLE_TREATMENTS)[number];
  /** Colour of the band behind the title ("band" treatment). */
  titleBand?: string;
  /** A slight tilt in degrees for playful covers (−8 … 8). */
  titleRotation?: number;
};

export type ComicScript = {
  title: string;
  /** Other titles the editor suggested, offered when the user confirms the title. */
  titleOptions?: string[];
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
  /** What they typically wear in this chapter of life (school uniform, hostel T-shirt…). */
  outfit?: string;
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

/**
 * A character's description without the clothes they happened to wear on their design sheet.
 * Panels get clothes from the scene, so the sheet's outfit must never leak into them.
 */
export function identityOnly(description: string): string {
  return description.split(/outfit on this sheet\s*:/i)[0].trim();
}

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
 * A comic is in "storyboard" from the moment writing starts until the user approves it; then it
 * moves to "drawing". Comics made before the storyboard existed have no stage.
 *
 * The flow is: draft (Characters) → storyboard (writing, then review) → drawing (Your comic).
 */
export type ComicStage = "storyboard" | "drawing";

/** True only once the storyboard is approved: the single gate in front of every paid picture. */
export function drawingApproved(comic: Pick<Comic, "status" | "stage">): boolean {
  if (comic.status !== "ready") return false;
  // Legacy comics (made before the storyboard step) were drawn straight away.
  return comic.stage === "drawing" || comic.stage === undefined;
}

/** Where a comic belongs in the flow, so every page can send people to the right step. */
export function comicStep(comic: Pick<Comic, "status" | "stage">): "characters" | "storyboard" | "comic" {
  if (comic.status === "draft") return "characters";
  return drawingApproved(comic) ? "comic" : "storyboard";
}

export type CostItem = "cast" | "photo-check" | "character-design" | "design-description" | "script" | "picture" | "redraw" | "interview";

/** One measured AI call: who served it, which model, what it did, and what it cost. */
export type CostUsage = {
  provider: "anthropic" | "openai";
  model: string;
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Image calls: size, quality and how many reference pictures were sent. */
  image?: { size: string; quality: string; references: number };
  /** Voice calls: seconds of audio heard or spoken. */
  audioSeconds?: number;
  /** True when the price comes from usage the provider reported; false for an estimate. */
  measured?: boolean;
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
  /**
   * Listing on the Explore page. For the prototype every comic is on Explore by default;
   * `published: false` means the owner hid it.
   */
  explore?: { published: boolean; publishedAt: string };
  /** Recreate: the format this comic was modelled on (another comic's remix preset). */
  preset?: RemixPreset;
  /** How many single pictures the user has asked us to redraw (for limits and pricing later). */
  redraws?: number;
  /** Every paid AI call made for this comic, with its estimated price (see src/lib/costs.ts). */
  costLog?: CostEntry[];
  error?: string;
  script?: ComicScript;
};

/** Prototype rule: every comic is on Explore unless its owner hid it. */
export function onExplore(comic: Pick<Comic, "explore">): boolean {
  return comic.explore?.published !== false;
}

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

/**
 * The reusable creative format of a comic, safe to share: style, structure, pacing and cover
 * direction. Never contains names, photos, dialogue, story text or character designs.
 */
export type RemixPreset = {
  sourceId: string;
  title: string;
  styleId: string;
  pageCount: number;
  panelCount: number;
  layoutPattern: LayoutId[];
  pacing: "sparse" | "balanced" | "dense";
  /** How many hero panels it had, and on which pages (as a share of the book, 0-1). */
  heroCount?: number;
  heroPlacement?: number[];
  /** Dialogue treatment: how much text per panel, how many silent panels, sound effects. */
  dialogue?: "minimal" | "balanced" | "chatty";
  silentShare?: number;
  sfxShare?: number;
  coverApproach?: string;
  coverTitleFont?: CoverFont;
  coverPalette?: { fill: string; outline: string };
  /** The title treatment (size, case, alignment, effect), never the title itself. */
  coverTitle?: Pick<CoverDesign, "titleSize" | "titleTreatment" | "titleAlign" | "titleCase" | "titleTracking" | "titlePosition">;
};

export function remixPresetFor(comic: Comic): RemixPreset | null {
  const script = comic.script;
  if (!script) return null;
  const panelCount = countPanels(script);
  const perPage = panelCount / Math.max(1, script.pages.length);
  const design = script.cover?.design;
  const panels = script.pages.flatMap((page) => page.panels);
  const words = panels.reduce((sum, panel) => sum + panel.dialogue.reduce((n, line) => n + line.text.split(/\s+/).filter(Boolean).length, 0), 0);
  const perPanel = words / Math.max(1, panels.length);
  const heroAt = script.pages.flatMap((page, p) => (page.panels.some((panel) => panel.hero) ? [Number((p / Math.max(1, script.pages.length - 1)).toFixed(2))] : []));
  return {
    sourceId: comic.id,
    title: script.title,
    styleId: comic.styleId,
    pageCount: script.pages.length,
    panelCount,
    layoutPattern: script.pages.map((page) => page.layout),
    pacing: perPage < 3 ? "sparse" : perPage > 4.2 ? "dense" : "balanced",
    heroCount: panels.filter((panel) => panel.hero).length,
    heroPlacement: heroAt,
    dialogue: perPanel < 6 ? "minimal" : perPanel > 14 ? "chatty" : "balanced",
    silentShare: Number((panels.filter((panel) => panel.dialogue.length === 0 && !panel.caption.trim()).length / Math.max(1, panels.length)).toFixed(2)),
    sfxShare: Number((panels.filter((panel) => panel.sfx?.trim()).length / Math.max(1, panels.length)).toFixed(2)),
    coverApproach: design?.approach,
    coverTitleFont: design?.titleFont,
    coverPalette: design ? { fill: design.titleFill, outline: design.titleOutline } : undefined,
    coverTitle: design
      ? { titleSize: design.titleSize, titleTreatment: design.titleTreatment, titleAlign: design.titleAlign, titleCase: design.titleCase, titleTracking: design.titleTracking, titlePosition: design.titlePosition }
      : undefined,
  };
}
