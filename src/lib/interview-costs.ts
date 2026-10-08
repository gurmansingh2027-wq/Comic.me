import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CostUsage } from "./comic";

// The voice interview happens before a comic exists. Its paid calls (Claude turns, transcription,
// read-aloud) are collected here under the browser's interview session id, then moved onto the
// comic's cost log when the story is locked.

const ROOT = path.join(process.cwd(), "storage", "interviews");
const SESSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** More calls than any real interview makes; stops a runaway session file. */
const MAX_ENTRIES = 300;

const shared = globalThis as typeof globalThis & { interviewLocks?: Map<string, Promise<unknown>> };
const locks = (shared.interviewLocks ??= new Map());

function locked<T>(session: string, task: () => Promise<T>): Promise<T> {
  const next = (locks.get(session) ?? Promise.resolve()).catch(() => {}).then(task);
  locks.set(session, next);
  void next.finally(() => {
    if (locks.get(session) === next) locks.delete(session);
  }).catch(() => {});
  return next;
}

/** The session id the browser sent, if it is a valid one. */
export function interviewSession(value: unknown): string | null {
  return typeof value === "string" && SESSION_PATTERN.test(value) ? value : null;
}

const fileFor = (session: string) => path.join(ROOT, `${session}.json`);

async function read(session: string): Promise<CostUsage[]> {
  try {
    return JSON.parse(await readFile(fileFor(session), "utf8"));
  } catch {
    return [];
  }
}

/** Adds an interview call's usage. Never fails the interview itself. */
export async function recordInterviewCost(session: string | null, usage: CostUsage[]): Promise<void> {
  if (!session || usage.length === 0) return;
  await locked(session, async () => {
    const entries = await read(session);
    if (entries.length >= MAX_ENTRIES) return;
    await mkdir(ROOT, { recursive: true });
    await writeFile(fileFor(session), JSON.stringify([...entries, ...usage]));
  }).catch(() => {});
}

/** Removes and returns everything recorded for an interview, to attach it to the new comic. */
export function takeInterviewCosts(session: string | null): Promise<CostUsage[]> {
  if (!session) return Promise.resolve([]);
  return locked(session, async () => {
    const entries = await read(session);
    await rm(fileFor(session), { force: true });
    return entries;
  });
}
