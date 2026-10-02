import { describe, expect, it } from "vitest";

import { getQuoteEditor, registerQuoteEditor, wantsNewQuote } from "./quote-editor-bridge";

describe("quote editor bridge", () => {
  it("enregistre puis libère l'éditeur du devis affiché", async () => {
    const off = registerQuoteEditor(async () => ({ ok: true, changes: ["x"], warnings: [] }));
    expect(getQuoteEditor()).not.toBeNull();
    off();
    expect(getQuoteEditor()).toBeNull();
  });

  it("distingue une modification d'une demande de nouveau devis", () => {
    expect(wantsNewQuote("passe les tuiles à 450")).toBe(false);
    expect(wantsNewQuote("Fais-moi un nouveau devis pour M. Durand")).toBe(true);
    expect(wantsNewQuote("refais tout")).toBe(true);
  });
});
