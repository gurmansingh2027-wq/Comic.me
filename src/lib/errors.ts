import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/** An error whose message is safe and helpful to show to the person using the app. */
export class UserFacingError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function requireEnv(name: "ANTHROPIC_API_KEY" | "OPENAI_API_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new UserFacingError(
      `The ${name} is missing. Paste it into the .env.local file in the project folder, then restart the app.`,
      500,
    );
  }
  return value;
}

/** Turns any error from our code or either AI provider into a JSON response with a friendly message. */
export function errorResponse(error: unknown): Response {
  if (error instanceof UserFacingError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error(error);

  if (error instanceof Anthropic.AuthenticationError) {
    return friendly("Your Anthropic (Claude) API key was rejected. Double-check ANTHROPIC_API_KEY in .env.local.", 500);
  }
  if (error instanceof OpenAI.AuthenticationError) {
    return friendly("Your OpenAI API key was rejected. Double-check OPENAI_API_KEY in .env.local.", 500);
  }
  if (error instanceof Anthropic.RateLimitError || error instanceof OpenAI.RateLimitError) {
    return friendly("The AI service is busy or your account is out of credit. Wait a minute and try again.", 429);
  }
  if (error instanceof OpenAI.BadRequestError) {
    return friendly(
      `The image service couldn't draw this panel: ${error.message}. Try again, or soften the wording of your story.`,
      400,
    );
  }
  if (error instanceof Anthropic.APIError || error instanceof OpenAI.APIError) {
    return friendly("The AI service had a hiccup. Please try again.", 502);
  }
  return friendly("Something went wrong on our side. Please try again.", 500);
}

function friendly(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
