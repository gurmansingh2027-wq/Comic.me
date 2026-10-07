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

/** Turns any error from our code or either AI provider into a message that's safe to show the user. */
export function friendlyError(error: unknown): { message: string; status: number } {
  if (error instanceof UserFacingError) {
    return { message: error.message, status: error.status };
  }

  console.error(error);

  if (error instanceof Anthropic.AuthenticationError) {
    return { message: "Your Anthropic (Claude) API key was rejected. Double-check ANTHROPIC_API_KEY in .env.local.", status: 500 };
  }
  if (error instanceof OpenAI.AuthenticationError) {
    return { message: "Your OpenAI API key was rejected. Double-check OPENAI_API_KEY in .env.local.", status: 500 };
  }
  if (error instanceof Anthropic.RateLimitError || error instanceof OpenAI.RateLimitError) {
    return { message: "The AI service is busy or your account is out of credit. Wait a minute and try again.", status: 429 };
  }
  if (error instanceof OpenAI.BadRequestError) {
    return {
      message: `The image service couldn't draw this: ${error.message}. Try again, or soften the wording of your story.`,
      status: 400,
    };
  }
  if (error instanceof Anthropic.APIError || error instanceof OpenAI.APIError) {
    return { message: "The AI service had a hiccup. Please try again.", status: 502 };
  }
  return { message: "Something went wrong on our side. Please try again.", status: 500 };
}

export function errorResponse(error: unknown): Response {
  const { message, status } = friendlyError(error);
  return Response.json({ error: message }, { status });
}
