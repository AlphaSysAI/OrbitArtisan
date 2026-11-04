import { expect, it } from "vitest";
import { aiRequestSignal, withAiRequestBudget } from "./request-budget";

it("borne les appels imbriqués sans partager le budget entre requêtes", async () => {
  const exhausted = withAiRequestBudget(1000, 1, async () => {
    await Promise.resolve();
    expect(aiRequestSignal(500)).toBeInstanceOf(AbortSignal);
    expect(() => aiRequestSignal(500)).toThrow("ai_request_budget_exhausted");
  });
  await withAiRequestBudget(1000, 2, async () => {
    await Promise.resolve();
    expect(aiRequestSignal(500)).toBeInstanceOf(AbortSignal);
    expect(aiRequestSignal(500)).toBeInstanceOf(AbortSignal);
  });
  await exhausted;
});
