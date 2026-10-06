import { randomUUID } from "node:crypto";
import { MAX_STORY_LENGTH, MIN_STORY_LENGTH, type Comic } from "@/lib/comic";
import { generateScript } from "@/lib/engines/story";
import { errorResponse, UserFacingError } from "@/lib/errors";
import { saveComic } from "@/lib/storage";
import { getStyle } from "@/lib/styles";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Step 1 of making a comic: write the script with Claude and save it. Returns the new comic's id. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { story?: unknown; styleId?: unknown };
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

    const script = await generateScript(story, style);
    const comic: Comic = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      styleId: style.id,
      story,
      script,
    };
    await saveComic(comic);

    return Response.json({ id: comic.id });
  } catch (error) {
    return errorResponse(error);
  }
}
