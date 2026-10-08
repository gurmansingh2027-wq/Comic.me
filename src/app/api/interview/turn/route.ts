import { nextInterviewTurn } from "@/lib/engines/interview";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { isValidTranscript } from "@/lib/interview";
import { interviewSession, recordInterviewCost } from "@/lib/interview-costs";
import { metered } from "@/lib/meter";

export const runtime = "nodejs";
export const maxDuration = 120;

/** The interviewer's next spoken turn, given the conversation so far. */
export async function POST(request: Request) {
  try {
    const { turns, session } = (await request.json().catch(() => ({}))) as { turns?: unknown; session?: unknown };
    if (!isValidTranscript(turns)) throw new UserFacingError("That conversation is too long or malformed.");
    const { result, usage } = await metered(() => nextInterviewTurn(turns));
    await recordInterviewCost(interviewSession(session), usage);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
