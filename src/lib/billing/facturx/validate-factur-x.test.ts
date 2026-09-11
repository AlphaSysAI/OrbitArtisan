import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@stackforge-eu/factur-x", () => ({
  Profile: { BASIC: "basic", EN16931: "en16931" },
  validateXsd: vi.fn(async () => ({ valid: true, errors: [] })),
}));

describe("validateFacturXXml", () => {
  beforeEach(() => {
    vi.stubEnv("FACTURX_SKIP_STACKFORGE", "0");
  });

  it("accepte un XML quand StackForge valide", async () => {
    const { validateFacturXXml } = await import("./validate-factur-x");
    await expect(validateFacturXXml("<xml/>", "en16931")).resolves.toBeUndefined();
  });
});
