import { describe, expect, it } from "vitest";

import { normalizeWebUrl } from "./web-url";

describe("normalizeWebUrl", () => {
  it("ajoute https:// quand il manque", () => {
    expect(normalizeWebUrl("www.ksjdkljklds.com")).toBe("https://www.ksjdkljklds.com");
    expect(normalizeWebUrl("  mediateur.fr/saisine ")).toBe("https://mediateur.fr/saisine");
  });

  it("conserve une adresse déjà complète", () => {
    expect(normalizeWebUrl("https://www.cm2c.net")).toBe("https://www.cm2c.net");
    expect(normalizeWebUrl("HTTP://exemple.fr")).toBe("HTTP://exemple.fr");
  });

  it("refuse ce qui n'est pas une adresse web", () => {
    expect(normalizeWebUrl("")).toBeNull();
    expect(normalizeWebUrl(null)).toBeNull();
    expect(normalizeWebUrl("médiateur")).toBeNull();
    expect(normalizeWebUrl("www exemple fr")).toBeNull();
    expect(normalizeWebUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeWebUrl("mailto:contact@exemple.fr")).toBeNull();
    expect(normalizeWebUrl("ftp://exemple.fr")).toBeNull();
  });
});
