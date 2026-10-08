import { transcribe } from "@/lib/engines/voice";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { interviewSession, recordInterviewCost } from "@/lib/interview-costs";
import { metered } from "@/lib/meter";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 20 * 1024 * 1024;

/** Turns a voice recording into text. */
export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null);
    const audio = form?.get("audio");
    if (!(audio instanceof File) || audio.size === 0) throw new UserFacingError("We didn't receive any audio.");
    if (audio.size > MAX_BYTES) throw new UserFacingError("That recording is too long. Try shorter answers.");
    const { result: text, usage } = await metered(() => transcribe(audio));
    await recordInterviewCost(interviewSession(form?.get("session")), usage);
    if (!text) throw new UserFacingError("We couldn't hear anything. Try again a little closer to the mic.");
    return Response.json({ text });
  } catch (error) {
    return errorResponse(error);
  }
}
