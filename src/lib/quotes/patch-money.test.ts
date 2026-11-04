import { expect, it } from "vitest";
import { FORM_PATCH_SYSTEM_PROMPT } from "./form-patch";
import { QUOTE_PATCH_SYSTEM_PROMPT } from "./voice-patch";
import { QUOTE_PATCH_MONEY_RULE, requiresQuotePatchVatReview } from "./patch-money";
import { llmQuotePatch } from "./voice-patch-llm";

it("les deux prompts excluent la conversion TTC sans connaître la TVA", async () => {
  expect(FORM_PATCH_SYSTEM_PROMPT).toContain(QUOTE_PATCH_MONEY_RULE);
  expect(QUOTE_PATCH_SYSTEM_PROMPT).toContain(QUOTE_PATCH_MONEY_RULE);
  expect(requiresQuotePatchVatReview("mettre 110 € T.T.C.")).toBe(true);
  expect(requiresQuotePatchVatReview("mettre 110 € HT")).toBe(false);
  await expect(llmQuotePatch({} as never, "mettre 110 € TTC", { hours: 2, totalEur: null }))
    .resolves.toEqual({ operations: [], unresolved: ["mettre 110 € TTC"] });
});
