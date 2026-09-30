import { describe, expect, it } from "vitest";

import { buildQuoteResponseToken, verifyQuoteResponseToken } from "./response-link";

const id = "11111111-2222-3333-4444-555555555555";

describe("lien de réponse devis", () => {
  it("vérifie un jeton authentique", () => {
    expect(verifyQuoteResponseToken(buildQuoteResponseToken(id, "k"), "k")).toBe(id);
  });
  it("refuse falsification, autre clé et jeton RDV", () => {
    const t = buildQuoteResponseToken(id, "k");
    expect(verifyQuoteResponseToken(t, "autre")).toBeNull();
    expect(verifyQuoteResponseToken(`99999999-2222-3333-4444-555555555555.${t.split(".")[1]}`, "k")).toBeNull();
    expect(verifyQuoteResponseToken(`${t}.x`, "k")).toBeNull();
    expect(verifyQuoteResponseToken("n'importe", "k")).toBeNull();
  });
});
