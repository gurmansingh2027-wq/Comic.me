import { composeStory } from "@/lib/engines/interview";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { isValidTranscript } from "@/lib/interview";
import { interviewSession, recordInterviewCost } from "@/lib/interview-costs";
import { metered } from "@/lib/meter";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Writes the interview up as a story (plus the cast) for the user to check and lock. */
export async function POST(request: Request) {
  try {
    const { turns, session } = (await request.json().catch(() => ({}))) as { turns?: unknown; session?: unknown };
    if (!isValidTranscript(turns)) throw new UserFacingError("That conversation is too long or malformed.");
    if (!turns.some((turn) => turn.role === "user")) throw new UserFacingError("Tell us a bit of your story first.");
    const { result, usage } = await metered(() => composeStory(turns));
    await recordInterviewCost(interviewSession(session), usage);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
