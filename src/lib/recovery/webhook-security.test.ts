import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { safeEqual, verifyHmacSignature, verifySharedSecret } from "./webhook-security";

const SECRET = "s3cr3t-rubypayeur";
const BODY = JSON.stringify({ event: "case.collected", case_id: "rp_42" });

function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifyHmacSignature", () => {
  it("accepte une signature valide, préfixée ou non", () => {
    expect(verifyHmacSignature(BODY, sign(BODY), SECRET)).toBe(true);
    expect(verifyHmacSignature(BODY, `sha256=${sign(BODY)}`, SECRET)).toBe(true);
  });

  it("refuse un corps altéré", () => {
    expect(verifyHmacSignature(`${BODY} `, sign(BODY), SECRET)).toBe(false);
  });

  it("refuse une signature d'un autre secret", () => {
    expect(verifyHmacSignature(BODY, sign(BODY, "autre-secret"), SECRET)).toBe(false);
  });

  it("refuse une signature absente ou malformée", () => {
    expect(verifyHmacSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyHmacSignature(BODY, "", SECRET)).toBe(false);
    expect(verifyHmacSignature(BODY, "pas-du-hex", SECRET)).toBe(false);
  });
});

describe("verifySharedSecret", () => {
  it("accepte le secret en en-tête", () => {
    const request = new Request("https://app.solinebtp.fr/api/webhooks/mysendingbox", {
      method: "POST",
      headers: { "x-webhook-secret": SECRET },
    });
    expect(verifySharedSecret(request, SECRET)).toBe(true);
  });

  it("accepte le secret en paramètre d'URL", () => {
    const request = new Request(
      `https://app.solinebtp.fr/api/webhooks/mysendingbox?secret=${SECRET}`,
      { method: "POST" },
    );
    expect(verifySharedSecret(request, SECRET)).toBe(true);
  });

  it("refuse une requête sans secret ou avec un mauvais secret", () => {
    const anonymous = new Request("https://app.solinebtp.fr/api/webhooks/mysendingbox", {
      method: "POST",
    });
    expect(verifySharedSecret(anonymous, SECRET)).toBe(false);

    const wrong = new Request("https://app.solinebtp.fr/api/webhooks/mysendingbox?secret=nope", {
      method: "POST",
    });
    expect(verifySharedSecret(wrong, SECRET)).toBe(false);
  });
});

describe("safeEqual", () => {
  it("compare sans fuiter la longueur", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("abc", "abd")).toBe(false);
  });
});
