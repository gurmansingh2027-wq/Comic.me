import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";

/** Budget for the explicitly authorized development audit. Uncertain requests retain their reservation. */
type Budget = { cap: number; spent: number; reserved: number; calls: number };
const store = new AsyncLocalStorage<{ file: string }>();
let lock: Promise<unknown> = Promise.resolve();
export const auditBudgetActive = () => !!store.getStore();
async function change(fn: (budget: Budget) => void): Promise<Budget> {
  const file = store.getStore()!.file;
  const job = lock.catch(() => {}).then(async () => {
    const budget: Budget = JSON.parse(await readFile(file, "utf8").catch(() => '{"cap":1,"spent":0,"reserved":0,"calls":0}'));
    fn(budget);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(budget, null, 2)); await rename(`${file}.tmp`, file);
    return budget;
  });
  lock = job; return job;
}
export async function reserveAuditCost(inputTokens: number, outputLimit: number): Promise<number> {
  if (!auditBudgetActive()) return 0;
  // Counted input plus 20% and 4k tokens for schema/accounting overhead; full output-token limit.
  const reserve = ((Math.ceil(inputTokens * 1.2) + 4096) * 4 + outputLimit * 20) / 1_000_000;
  await change(budget => {
    if (budget.spent + budget.reserved + reserve > budget.cap) throw new Error("Audit budget exhausted: the next request's maximum reservation would exceed $1.");
    budget.reserved += reserve; budget.calls++;
  });
  return reserve;
}
export async function settleAuditCost(reservation: number, actual: number) {
  if (!auditBudgetActive()) return;
  await change(budget => { budget.reserved = Math.max(0, budget.reserved - reservation); budget.spent += actual; });
}
export function withAuditBudget<T>(fn: () => Promise<T>) {
  return store.run({ file: path.join(process.cwd(), ".context", "continuity-qa-budget.json") }, fn);
}
export async function readAuditBudget() {
  return withAuditBudget(() => change(() => {}));
}
