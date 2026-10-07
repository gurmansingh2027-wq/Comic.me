// Shared shape of the story interview. Safe to import from both server and browser code.

export type InterviewTurn = { role: "ai" | "user"; text: string };

export const INTERVIEW_GREETING =
  "Hi! I'm your Comic.me storyteller. Tell me the story you'd like to turn into a comic: who's it about, and what happened? Just talk like you're telling a friend.";

/** Guards so one conversation can't run up a big bill. */
export const MAX_TURNS = 40;
export const MAX_TURN_LENGTH = 6000;

export function isValidTranscript(value: unknown): value is InterviewTurn[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_TURNS &&
    value.every(
      (turn) =>
        turn &&
        (turn.role === "ai" || turn.role === "user") &&
        typeof turn.text === "string" &&
        turn.text.length <= MAX_TURN_LENGTH,
    )
  );
}
