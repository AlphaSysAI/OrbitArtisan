import { describe, expect, it } from "vitest";

import { resolveAssistantPageContext } from "./assistant-page-context";

describe("resolveAssistantPageContext", () => {
  it("propose des actions sur le tableau de bord", () => {
    const ctx = resolveAssistantPageContext("/app");
    expect(ctx.label).toBe("Tableau de bord");
    expect(ctx.suggestions).toHaveLength(2);
  });

  it("détecte une fiche devis", () => {
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const ctx = resolveAssistantPageContext(`/app/quotes/${id}`);
    expect(ctx.entityType).toBe("quote");
    expect(ctx.entityId).toBe(id);
    expect(ctx.suggestions.some((s) => s.includes("devis"))).toBe(true);
  });

  it("adapte le nouveau devis", () => {
    const ctx = resolveAssistantPageContext("/app/quotes/new");
    expect(ctx.pageKey).toBe("quotes-new");
    expect(ctx.suggestions.length).toBeGreaterThan(0);
  });
});
