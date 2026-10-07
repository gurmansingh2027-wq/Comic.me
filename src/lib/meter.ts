import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { CostUsage } from "./comic";

// Measures what AI calls really cost. Wrap a piece of work in `metered(...)`; every Claude or
// image call made inside it records its provider, model, tokens/size and price automatically.

const store = new AsyncLocalStorage<CostUsage[]>();

export async function metered<T>(work: () => Promise<T>): Promise<{ result: T; usage: CostUsage[] }> {
  const usage: CostUsage[] = [];
  const result = await store.run(usage, work);
  return { result, usage };
}

export function recordUsage(entry: CostUsage): void {
  store.getStore()?.push(entry);
}
