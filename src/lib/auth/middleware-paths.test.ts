import { describe, expect, it } from "vitest";

import { pathNeedsArtisanProfile, pathUsesSession } from "@/lib/auth/middleware-paths";

describe("pathUsesSession", () => {
  it.each([
    "/",
    "/app",
    "/app/quotes/123",
    "/compte/factures",
    "/mes-devis/abc",
    "/admin",
    "/admin/tenants/1",
    "/login",
    "/register",
    "/inscription-client",
    "/invitation/tok",
    "/site/plombier-dupont",
    "/site/plombier-dupont/cgv",
    "/auth/callback",
  ])("garde la session sur %s", (path) => {
    expect(pathUsesSession(path)).toBe(true);
  });

  it.each([
    "/embed/plombier-dupont",
    "/estimation",
    "/estimation/suivi",
    "/cgu",
    "/cgv",
    "/mentions-legales",
    "/confidentialite",
    "/intervention/tok",
    "/ambassadeur",
    "/manifest.webmanifest",
    "/apps", // préfixe proche mais distinct
    "/sitemap.xml",
  ])("ignore la session sur %s", (path) => {
    expect(pathUsesSession(path)).toBe(false);
  });
});

describe("pathNeedsArtisanProfile", () => {
  it.each(["/", "/app", "/app/reglages", "/compte", "/compte/factures/1"])("%s → profil requis", (path) => {
    expect(pathNeedsArtisanProfile(path)).toBe(true);
  });

  it.each(["/mes-devis", "/admin", "/login", "/site/x", "/application"])("%s → pas de profil", (path) => {
    expect(pathNeedsArtisanProfile(path)).toBe(false);
  });
});
