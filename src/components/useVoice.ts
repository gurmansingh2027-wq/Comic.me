"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Longest single answer we record before stopping automatically. */
const MAX_RECORDING_MS = 3 * 60 * 1000;

/** Microphone recording (press to start, press to stop) and playback of spoken replies. */
export function useVoice() {
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
  }, []);

  /** Starts recording. Resolves with the audio once stopRecording() is called. */
  const startRecording = useCallback(async (): Promise<Blob | null> => {
    stopSpeaking();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);

    const done = new Promise<Blob | null>((resolve) => {
      resolveRef.current = resolve;
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null);
      };
    });
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
    timerRef.current = setTimeout(() => recorder.state === "recording" && recorder.stop(), MAX_RECORDING_MS);
    return done;
  }, [stopSpeaking]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  /** Plays the interviewer's reply aloud. */
  const say = useCallback(
    async (text: string) => {
      stopSpeaking();
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) return;
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      setSpeaking(true);
      await audio.play().catch(() => setSpeaking(false));
    },
    [stopSpeaking],
  );

  useEffect(
    () => () => {
      stopSpeaking();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    },
    [stopSpeaking],
  );

  return { recording, speaking, startRecording, stopRecording, say, stopSpeaking };
}

export function audioFileName(blob: Blob): string {
  return blob.type.includes("mp4") ? "answer.mp4" : "answer.webm";
}
