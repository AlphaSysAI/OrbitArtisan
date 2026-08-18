import { describe, expect, it } from "vitest";

import {
  formatContactDisplayName,
  joinPersonName,
  looksLikeEmailLocalPart,
  splitPersonName,
} from "@/lib/contacts/display-name";

describe("formatContactDisplayName", () => {
  it("prefers profile name over snapshot name", () => {
    expect(
      formatContactDisplayName({
        profileName: "Jean Dupont",
        name: "jean.dupont",
        email: "jean.dupont@example.com",
      }),
    ).toBe("Jean Dupont");
  });

  it("rejects email prefix and falls back", () => {
    expect(
      formatContactDisplayName({
        name: "jean.dupont",
        email: "jean.dupont@example.com",
      }),
    ).toBe("Client");
  });

  it("uses customer_name when it is a real name", () => {
    expect(
      formatContactDisplayName({
        name: "Marie Martin",
        email: "marie@example.com",
      }),
    ).toBe("Marie Martin");
  });
});

describe("looksLikeEmailLocalPart", () => {
  it("detects prefix match", () => {
    expect(looksLikeEmailLocalPart("camille", "camille@artisan.fr")).toBe(true);
    expect(looksLikeEmailLocalPart("Camille", "camille@artisan.fr")).toBe(true);
    expect(looksLikeEmailLocalPart("Camille Dupont", "camille@artisan.fr")).toBe(false);
  });
});

describe("splitPersonName / joinPersonName", () => {
  it("splits and joins full names", () => {
    expect(splitPersonName("Jean Dupont")).toEqual({ firstName: "Jean", lastName: "Dupont" });
    expect(joinPersonName("Jean", "Dupont")).toBe("Jean Dupont");
  });
});
