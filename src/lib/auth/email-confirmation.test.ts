import { describe, expect, it } from "vitest";

import {
  FORGOT_PASSWORD_PATH,
  NEW_PASSWORD_PATH,
  buildAuthLinkFailurePath,
  buildCallbackLoginPath,
  buildEmailConfirmationRedirect,
  buildTokenHashLink,
  parseEmailOtpType,
  sanitizeEmailParam,
} from "./email-confirmation";

describe("sanitizeEmailParam", () => {
  it("normalise une adresse valide", () => {
    expect(sanitizeEmailParam("  Jean.Dupont@Exemple.FR ")).toBe("jean.dupont@exemple.fr");
  });

  it("rejette les valeurs qui ne sont pas des e-mails", () => {
    expect(sanitizeEmailParam("")).toBe("");
    expect(sanitizeEmailParam(null)).toBe("");
    expect(sanitizeEmailParam("pas-un-mail")).toBe("");
    expect(sanitizeEmailParam("a b@c.fr")).toBe("");
  });
});

describe("buildEmailConfirmationRedirect", () => {
  it("ajoute la destination et l'e-mail au lien de retour", () => {
    const url = new URL(buildEmailConfirmationRedirect("https://app.solinebtp.fr/", "/app/onboarding", "Toi@Atelier.fr"));
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("next")).toBe("/app/onboarding");
    expect(url.searchParams.get("email")).toBe("toi@atelier.fr");
  });

  it("omet un e-mail invalide", () => {
    const url = new URL(buildEmailConfirmationRedirect("https://app.solinebtp.fr", "/app", "nope"));
    expect(url.searchParams.has("email")).toBe(false);
  });
});

describe("buildCallbackLoginPath", () => {
  function parse(path: string) {
    return new URL(path, "https://app.solinebtp.fr").searchParams;
  }

  it("préremplit l'e-mail après une confirmation réussie", () => {
    const sp = parse(buildCallbackLoginPath({ next: "/app/onboarding", email: "toi@atelier.fr" }));
    expect(sp.get("success")).toBe("email_confirmed");
    expect(sp.get("email")).toBe("toi@atelier.fr");
    expect(sp.get("role")).toBe("artisan");
    expect(sp.get("next")).toBe("/app/onboarding");
  });

  it("signale un lien expiré", () => {
    const sp = parse(buildCallbackLoginPath({ next: "/app", email: "toi@atelier.fr", linkError: "otp_expired" }));
    expect(sp.get("error")).toBe("link_expired");
    expect(sp.has("success")).toBe(false);
  });

  it("bascule vers l'espace client pour une destination client", () => {
    expect(parse(buildCallbackLoginPath({ next: "/compte/messages", email: null })).get("role")).toBe("particulier");
  });

  it("neutralise une destination externe", () => {
    expect(parse(buildCallbackLoginPath({ next: "https://pirate.example", email: null })).get("next")).toBe("/app");
  });
});

describe("buildAuthLinkFailurePath", () => {
  it("renvoie vers « mot de passe oublié » pour un lien de réinitialisation", () => {
    const path = buildAuthLinkFailurePath({ next: NEW_PASSWORD_PATH, email: "toi@atelier.fr", linkError: "otp_expired" });
    const url = new URL(path, "https://app.solinebtp.fr");
    expect(url.pathname).toBe(FORGOT_PASSWORD_PATH);
    expect(url.searchParams.get("error")).toBe("link_expired");
    expect(url.searchParams.get("email")).toBe("toi@atelier.fr");
  });

  it("renvoie vers la connexion dans les autres cas", () => {
    expect(buildAuthLinkFailurePath({ next: "/app/onboarding", email: null })).toMatch(/^\/login\?/);
  });
});

describe("parseEmailOtpType / buildTokenHashLink", () => {
  it("accepte uniquement les types connus", () => {
    expect(parseEmailOtpType("recovery")).toBe("recovery");
    expect(parseEmailOtpType("sms")).toBeNull();
    expect(parseEmailOtpType(null)).toBeNull();
  });

  it("construit un lien /auth/confirm", () => {
    const url = new URL(buildTokenHashLink("https://app.solinebtp.fr/", "abc123", "recovery", NEW_PASSWORD_PATH));
    expect(url.pathname).toBe("/auth/confirm");
    expect(url.searchParams.get("token_hash")).toBe("abc123");
    expect(url.searchParams.get("type")).toBe("recovery");
    expect(url.searchParams.get("next")).toBe(NEW_PASSWORD_PATH);
  });
});
