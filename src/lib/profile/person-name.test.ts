import { describe, expect, it } from "vitest";

import { composeDisplayName } from "./person-name";

describe("composeDisplayName", () => {
  it("assemble prénom et nom", () => {
    expect(composeDisplayName(" Jean-Pierre ", "de La  Fontaine")).toBe("Jean-Pierre de La Fontaine");
  });
  it("gère un champ vide", () => {
    expect(composeDisplayName("", "Martin")).toBe("Martin");
    expect(composeDisplayName(null, undefined)).toBe("");
  });
});
