import "server-only";
import OpenAI from "openai";
import { requireEnv } from "../errors";

// Voice: speech → text for what the user says, text → speech for the interviewer's replies.

const TRANSCRIBE_MODEL = "gpt-transcribe";
const SPEECH_MODEL = "gpt-4o-mini-tts";
const VOICE = "marin";
const VOICE_STYLE =
  "Warm, friendly and curious, like a close friend who loves hearing stories. Natural pace, gentle enthusiasm, smiling tone. Not salesy.";

function client() {
  return new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
}

export async function transcribe(audio: File): Promise<string> {
  const result = await client().audio.transcriptions.create({
    file: audio,
    model: TRANSCRIBE_MODEL,
    language: "en",
  });
  return result.text.trim();
}

export async function speak(text: string): Promise<ArrayBuffer> {
  const response = await client().audio.speech.create({
    model: SPEECH_MODEL,
    voice: VOICE,
    input: text,
    instructions: VOICE_STYLE,
    response_format: "mp3",
  });
  return response.arrayBuffer();
}
