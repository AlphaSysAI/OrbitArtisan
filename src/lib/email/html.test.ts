import { describe, expect, it } from "vitest";

import { escapeHtml } from "./html";

describe("escapeHtml", () => {
  it("neutralise balises et attributs", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(escapeHtml("Dupont & Fils l'artisan")).toBe("Dupont &amp; Fils l&#39;artisan");
  });
  it("gère null/undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});
