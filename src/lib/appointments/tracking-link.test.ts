import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildTrackingToken, verifyTrackingToken } from "./tracking-link";

const ID = "3f2b8c1e-6a4d-4e1f-9b2a-1c3d5e7f9a0b";

describe("lien de suivi de RDV", () => {
  it("vérifie un jeton authentique", () => {
    expect(verifyTrackingToken(buildTrackingToken(ID, "k1"), "k1")).toBe(ID);
  });

  it("refuse un jeton modifié, signé avec une autre clé ou mal formé", () => {
    const token = buildTrackingToken(ID, "k1");
    expect(verifyTrackingToken(token, "k2")).toBeNull();
    expect(verifyTrackingToken(token.replace(ID, "3f2b8c1e-6a4d-4e1f-9b2a-1c3d5e7f9a0c"), "k1")).toBeNull();
    expect(verifyTrackingToken("abc", "k1")).toBeNull();
    expect(verifyTrackingToken(`${ID}.`, "k1")).toBeNull();
  });
});
