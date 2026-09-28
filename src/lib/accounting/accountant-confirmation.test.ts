import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/send-email", () => ({ sendEmail: vi.fn() }));

import { hashConfirmToken, isConfirmTokenFormat } from "./accountant-confirmation";

describe("jeton de confirmation du comptable", () => {
  it("accepte le format généré (32 octets base64url) et refuse le reste", () => {
    expect(isConfirmTokenFormat(randomBytes(32).toString("base64url"))).toBe(true);
    expect(isConfirmTokenFormat("abc")).toBe(false);
    expect(isConfirmTokenFormat(`${"a".repeat(42)}/`)).toBe(false);
  });

  it("ne stocke qu'une empreinte SHA-256 stable", () => {
    const token = randomBytes(32).toString("base64url");
    expect(hashConfirmToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashConfirmToken(token)).toBe(hashConfirmToken(token));
    expect(hashConfirmToken(token)).not.toContain(token);
  });
});
