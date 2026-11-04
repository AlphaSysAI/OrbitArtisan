import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

const budget = new AsyncLocalStorage<{ deadline: number; remainingCalls: number }>();

export function withAiRequestBudget<T>(timeoutMs: number, calls: number, work: () => T): T {
  return budget.run({ deadline: Date.now() + timeoutMs, remainingCalls: calls }, work);
}

export function aiRequestSignal(defaultTimeoutMs: number) {
  const active = budget.getStore();
  if (!active) return AbortSignal.timeout(defaultTimeoutMs);
  const remainingMs = active.deadline - Date.now();
  if (remainingMs <= 0 || active.remainingCalls <= 0) throw new Error("ai_request_budget_exhausted");
  active.remainingCalls--;
  return AbortSignal.timeout(Math.min(defaultTimeoutMs, remainingMs));
}
