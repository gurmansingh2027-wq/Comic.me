import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { MAX_STORY_LENGTH, MIN_STORY_LENGTH, type Comic, type Intake } from "@/lib/comic";
import { isValidTranscript } from "@/lib/interview";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { runWriting } from "@/lib/pipeline";
import { saveComic } from "@/lib/storage";
import { getStyle } from "@/lib/styles";

export const runtime = "nodejs";
export const maxDuration = 800;

/** Starts a new comic: saves the story, then writes the script in the background. Returns the comic's id right away. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { story?: unknown; styleId?: unknown; intake?: Intake };
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
        ? { turns: body.intake.turns, characters: body.intake.characters.slice(0, 20) }
        : undefined;
    const comic: Comic = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      styleId: style.id,
      story,
      intake,
      status: "writing",
    };
    await saveComic(comic);
    after(() => runWriting(comic.id));

    return Response.json({ id: comic.id });
  } catch (error) {
    return errorResponse(error);
  }
}
