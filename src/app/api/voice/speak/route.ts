import { speak } from "@/lib/engines/voice";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { interviewSession, recordInterviewCost } from "@/lib/interview-costs";
import { metered } from "@/lib/meter";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Reads the interviewer's reply aloud (MP3). */
export async function POST(request: Request) {
  try {
    const { text, session } = (await request.json().catch(() => ({}))) as { text?: unknown; session?: unknown };
    if (typeof text !== "string" || !text.trim() || text.length > 800) throw new UserFacingError("Nothing to say.");
    const { result: audio, usage } = await metered(() => speak(text.trim()));
    await recordInterviewCost(interviewSession(session), usage);
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
