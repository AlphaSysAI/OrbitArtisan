import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { resolveDomainRouting, resolvePwaOrAppRootRedirect } from "./domain-routing";
import { PWA_STANDALONE_COOKIE } from "@/lib/pwa/constants";

const ENV_KEYS = ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_MARKETING_URL"] as const;

function mockEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
}

function request(url: string): NextRequest {
  return new NextRequest(url);
}

afterEach(() => {
  mockEnv({});
});

describe("resolveDomainRouting", () => {
  it("ne redirige pas en local mono-domaine", () => {
    mockEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" });
    expect(resolveDomainRouting(request("http://localhost:3000/login"))).toBeNull();
  });

  it("redirige le marketing vers l'app hors pages publiques", () => {
    mockEnv({
      NEXT_PUBLIC_MARKETING_URL: "https://solinebtp.fr",
      NEXT_PUBLIC_SITE_URL: "https://app.solinebtp.fr",
    });
    const res = resolveDomainRouting(request("https://solinebtp.fr/login"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.solinebtp.fr/login");
  });

  it("laisse la landing sur le marketing", () => {
    mockEnv({
      NEXT_PUBLIC_MARKETING_URL: "https://solinebtp.fr",
      NEXT_PUBLIC_SITE_URL: "https://app.solinebtp.fr",
    });
    expect(resolveDomainRouting(request("https://solinebtp.fr/"))).toBeNull();
  });

  it("redirige les pages légales de l'app vers le marketing", () => {
    mockEnv({
      NEXT_PUBLIC_MARKETING_URL: "https://solinebtp.fr",
      NEXT_PUBLIC_SITE_URL: "https://app.solinebtp.fr",
    });
    const res = resolveDomainRouting(request("https://app.solinebtp.fr/cgu"));
    expect(res?.headers.get("location")).toBe("https://solinebtp.fr/cgu");
  });

  it("redirige /cgv de l'app vers le marketing", () => {
    mockEnv({
      NEXT_PUBLIC_MARKETING_URL: "https://solinebtp.fr",
      NEXT_PUBLIC_SITE_URL: "https://app.solinebtp.fr",
    });
    const res = resolveDomainRouting(request("https://app.solinebtp.fr/cgv"));
    expect(res?.headers.get("location")).toBe("https://solinebtp.fr/cgv");
  });

  it("laisse /register sur le domaine app", () => {
    mockEnv({
      NEXT_PUBLIC_MARKETING_URL: "https://solinebtp.fr",
      NEXT_PUBLIC_SITE_URL: "https://app.solinebtp.fr",
    });
    expect(resolveDomainRouting(request("https://app.solinebtp.fr/register"))).toBeNull();
  });
});

describe("resolvePwaOrAppRootRedirect", () => {
  it("redirige la racine app vers login si non connecté (domain split)", () => {
    mockEnv({
      NEXT_PUBLIC_MARKETING_URL: "https://solinebtp.fr",
      NEXT_PUBLIC_SITE_URL: "https://app.solinebtp.fr",
    });
    const res = resolvePwaOrAppRootRedirect(request("https://app.solinebtp.fr/"), false, false);
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://app.solinebtp.fr/login?role=artisan");
  });

  it("redirige la racine app vers /app si artisan connecté", () => {
    mockEnv({
      NEXT_PUBLIC_MARKETING_URL: "https://solinebtp.fr",
      NEXT_PUBLIC_SITE_URL: "https://app.solinebtp.fr",
    });
    const res = resolvePwaOrAppRootRedirect(request("https://app.solinebtp.fr/"), true, true);
    expect(res?.headers.get("location")).toBe("https://app.solinebtp.fr/app");
  });

  it("redirige avec cookie PWA en mono-domaine", () => {
    mockEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" });
    const req = request("http://localhost:3000/");
    req.cookies.set(PWA_STANDALONE_COOKIE, "1");
    const res = resolvePwaOrAppRootRedirect(req, false, false);
    expect(res?.headers.get("location")).toBe("http://localhost:3000/login?role=artisan");
  });

  it("laisse la landing en navigateur sans cookie PWA (mono-domaine)", () => {
    mockEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" });
    expect(resolvePwaOrAppRootRedirect(request("http://localhost:3000/"), false, false)).toBeNull();
  });
});
