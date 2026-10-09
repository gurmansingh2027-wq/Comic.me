// Shared shape of the story interview. Safe to import from both server and browser code.

export type InterviewTurn = { role: "ai" | "user"; text: string };

export const INTERVIEW_GREETING =
  "Hey! I'm your Comic.me storyteller. What's the story? Who's in it, and what happened? Talk like you're telling a friend; I'll ask about the good bits.";

/** Recreate from Explore: the format is chosen, so we go straight to the person's own story. */
export function recreateGreeting(title: string): string {
  return `Good taste. We'll borrow the format of "${title}" (style, page rhythm, cover approach), but none of its story. So: what's your story? Who's it about, and what happened?`;
}

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
