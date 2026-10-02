import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { signToken, verifyToken } from "./signed-token";

const ID = "3f2b8c1e-6a4d-4e1f-9b2a-1c3d5e7f9a0b";

describe("signed-token", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepte un jeton authentique et refuse un autre scope", () => {
    const t = signToken("quote-response", ID, { key: "k" });
    expect(verifyToken("quote-response", t, { key: "k" })).toBe(ID);
    expect(verifyToken("appointment-tracking", t, { key: "k" })).toBeNull();
  });

  it("refuse clé différente, id modifié, segments en trop, encodage invalide", () => {
    const t = signToken("quote-response", ID, { key: "k" });
    expect(verifyToken("quote-response", t, { key: "autre" })).toBeNull();
    expect(verifyToken("quote-response", t.replace(ID, ID.replace(/b$/, "c")), { key: "k" })).toBeNull();
    expect(verifyToken("quote-response", `${t}.x`, { key: "k" })).toBeNull();
    expect(verifyToken("quote-response", "%E0%A4%A", { key: "k" })).toBeNull();
  });

  it("reste compatible avec les liens de désinscription déjà envoyés (24 caractères)", () => {
    const legacy = `${ID}.${createHmac("sha256", "k").update(`prospect-optout:${ID}`).digest("base64url").slice(0, 24)}`;
    expect(verifyToken("prospect-optout", legacy, { key: "k", sigLength: 24 })).toBe(ID);
  });

  it("échoue fermé sans clé configurée", () => {
    vi.stubEnv("APPOINTMENT_LINK_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => signToken("prospect-optout", ID)).toThrow();
    expect(() => verifyToken("prospect-optout", `${ID}.x`, { key: "" })).not.toThrow();
  });
});
