import { randomUUID } from "node:crypto";
import { addCost } from "@/lib/costs";
import { MAX_STORY_LENGTH, MIN_STORY_LENGTH, onExplore, remixPresetFor, type Comic, type Intake } from "@/lib/comic";
import { isValidTranscript } from "@/lib/interview";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { interviewSession, takeInterviewCosts } from "@/lib/interview-costs";
import { loadComic, saveComic } from "@/lib/storage";
import { getStyle } from "@/lib/styles";

export const runtime = "nodejs";
export const maxDuration = 800;

/** Saves the locked story and style as a draft for the Characters step. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { story?: unknown; styleId?: unknown; intake?: Intake; presetId?: unknown; session?: unknown };
    const story = typeof body.story === "string" ? body.story.trim() : "";
    const style = typeof body.styleId === "string" ? getStyle(body.styleId) : undefined;

    if (story.length < MIN_STORY_LENGTH) {
      throw new UserFacingError(`Please write a little more — at least ${MIN_STORY_LENGTH} characters.`);
    }
    if (story.length > MAX_STORY_LENGTH) {
      throw new UserFacingError(`Please keep your story under ${MAX_STORY_LENGTH} characters.`);
    }
    if (!style) {
      throw new UserFacingError("Please pick a comic style.");
    }

    const now = new Date().toISOString();
    const intake =
      body.intake && isValidTranscript(body.intake.turns) && Array.isArray(body.intake.characters)
        ? { turns: body.intake.turns, characters: body.intake.characters.filter((c) => c && typeof c.name === "string" && typeof c.role === "string" && typeof c.look === "string").slice(0, 20) }
        : undefined;
    // Recreate: copy only the published comic's format, never its content.
    const source = typeof body.presetId === "string" ? await loadComic(body.presetId) : null;
    const preset = source && onExplore(source) ? remixPresetFor(source) ?? undefined : undefined;
    const comic: Comic = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      styleId: style.id,
      story,
      intake,
      preset,
      status: "draft",
      qa: { version: 1, pictures: {} },
    };
    const interview = await takeInterviewCosts(interviewSession(body.session));
    if (interview.length > 0) addCost(comic, "interview", `${interview.length} voice & AI calls`, interview);
    await saveComic(comic);

    return Response.json({ id: comic.id });
  } catch (error) {
    return errorResponse(error);
  }
}
