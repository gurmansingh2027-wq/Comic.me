// Shared shape of a comic. Safe to import from both server and browser code.

export const PANEL_COUNT = 6;
export const MIN_STORY_LENGTH = 30;
export const MAX_STORY_LENGTH = 4000;

export type Side = "left" | "right";

export type DialogueLine = {
  speaker: string;
  side: Side;
  text: string;
};

export type Panel = {
  scene: string;
  caption: string;
  dialogue: DialogueLine[];
};

export type Character = {
  name: string;
  appearance: string;
};

export type ComicScript = {
  title: string;
  characters: Character[];
  panels: Panel[];
};

export type Comic = {
  id: string;
  createdAt: string;
  styleId: string;
  story: string;
  script: ComicScript;
};

export function panelImageUrl(comicId: string, panelNumber: number): string {
  return `/api/comics/${comicId}/panels/${panelNumber}`;
}
