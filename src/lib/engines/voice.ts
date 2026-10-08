import "server-only";
import OpenAI from "openai";
import { speechCost, transcriptionCost } from "../costs";
import { requireEnv } from "../errors";
import { recordUsage } from "../meter";

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
  const text = result.text.trim();
  // Billed per minute of audio; if OpenAI doesn't say how long it was, estimate from the words.
  const reported = result.usage?.type === "duration" ? result.usage.seconds : undefined;
  const seconds = reported ?? (text.split(/\s+/).filter(Boolean).length / 150) * 60;
  recordUsage({
    provider: "openai",
    model: TRANSCRIBE_MODEL,
    operation: "transcribe",
    audioSeconds: Math.round(seconds),
    usd: transcriptionCost(seconds),
    measured: reported !== undefined,
  });
  return text;
}

export async function speak(text: string): Promise<ArrayBuffer> {
  const response = await client().audio.speech.create({
    model: SPEECH_MODEL,
    voice: VOICE,
    input: text,
    instructions: VOICE_STYLE,
    response_format: "mp3",
  });
  recordUsage({ provider: "openai", model: SPEECH_MODEL, operation: "speak", usd: speechCost(text), measured: false });
  return response.arrayBuffer();
}
