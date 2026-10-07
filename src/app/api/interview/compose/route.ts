import { composeStory } from "@/lib/engines/interview";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { isValidTranscript } from "@/lib/interview";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Writes the interview up as a story (plus the cast) for the user to check and lock. */
export async function POST(request: Request) {
  try {
    const { turns } = (await request.json().catch(() => ({}))) as { turns?: unknown };
    if (!isValidTranscript(turns)) throw new UserFacingError("That conversation is too long or malformed.");
    if (!turns.some((turn) => turn.role === "user")) throw new UserFacingError("Tell us a bit of your story first.");
    return Response.json(await composeStory(turns));
  } catch (error) {
    return errorResponse(error);
  }
}
