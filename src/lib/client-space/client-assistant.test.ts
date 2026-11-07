import { describe, expect, it } from "vitest";

import { CLIENT_ASSISTANT_PROMPT, normalizeAssistantAnswer } from "@/lib/client-space/client-assistant";

const base = { reply: "Coupez l'eau.", urgency: "urgent" as const, sheet_ids: [], suggest_pro: false };

describe("réponse de l'assistant client", () => {
  it("garde les fiches connues, sans doublon, 3 au maximum", () => {
    const answer = normalizeAssistantAnswer({
      ...base,
      sheet_ids: ["client-fuite-eau-urgence", "fiche-inventee", "client-fuite-eau-urgence", "client-wc-bouche", "client-odeur-gaz", "client-coupure-courant"],
    });
    expect(answer.sheetIds).toEqual(["client-fuite-eau-urgence", "client-wc-bouche", "client-odeur-gaz"]);
  });

  it("écarte un métier inconnu et ne propose alors pas de mise en relation", () => {
    const answer = normalizeAssistantAnswer({ ...base, trade_category: "plomberie-chauffage", trade: "astronaute", suggest_pro: true, request_summary: "Fuite" });
    expect(answer.trade).toBeNull();
    expect(answer.suggestPro).toBe(false);
  });

  it("donne le libellé du métier identifié et la demande pour l'artisan", () => {
    const answer = normalizeAssistantAnswer({
      ...base,
      trade_category: "plomberie-chauffage",
      trade: "plombier",
      suggest_pro: true,
      request_summary: " De l'eau coule du plafond. ",
    });
    expect(answer.trade).toEqual({ categoryId: "plomberie-chauffage", tradeId: "plombier", label: "Plombier" });
    expect(answer.requestSummary).toBe("De l'eau coule du plafond.");
  });

  it("n'envoie pas de demande préparée quand aucun pro n'est proposé", () => {
    const answer = normalizeAssistantAnswer({ ...base, trade_category: "plomberie-chauffage", trade: "plombier", request_summary: "x" });
    expect(answer.requestSummary).toBeNull();
  });

  it("rappelle les numéros d'urgence et les interdits dans la consigne", () => {
    expect(CLIENT_ASSISTANT_PROMPT).toContain("0 800 47 33 33");
    expect(CLIENT_ASSISTANT_PROMPT).toContain("112");
    expect(CLIENT_ASSISTANT_PROMPT).toMatch(/tableau électrique/);
    expect(CLIENT_ASSISTANT_PROMPT).toContain("client-odeur-gaz");
  });
});
