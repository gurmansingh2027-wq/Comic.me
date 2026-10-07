import { nextInterviewTurn } from "@/lib/engines/interview";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { isValidTranscript } from "@/lib/interview";

export const runtime = "nodejs";
export const maxDuration = 120;

/** The interviewer's next spoken turn, given the conversation so far. */
export async function POST(request: Request) {
  try {
    const { turns } = (await request.json().catch(() => ({}))) as { turns?: unknown };
    if (!isValidTranscript(turns)) throw new UserFacingError("That conversation is too long or malformed.");
    return Response.json(await nextInterviewTurn(turns));
  } catch (error) {
    return errorResponse(error);
  }
}
