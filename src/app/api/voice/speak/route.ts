import { speak } from "@/lib/engines/voice";
import { errorResponse, UserFacingError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Reads the interviewer's reply aloud (MP3). */
export async function POST(request: Request) {
  try {
    const { text } = (await request.json().catch(() => ({}))) as { text?: unknown };
    if (typeof text !== "string" || !text.trim() || text.length > 800) throw new UserFacingError("Nothing to say.");
    const audio = await speak(text.trim());
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
