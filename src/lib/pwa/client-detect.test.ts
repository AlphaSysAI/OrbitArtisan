import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PWA_INSTALLED_KEY,
  PWA_INSTALL_DISMISS_KEY,
  rememberPwaInstalled,
  shouldSuppressInstallPrompt,
  wasPwaInstalled,
} from "./client-detect";

function createStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    clear: () => map.clear(),
  };
}

function stubBrowser(options: {
  standaloneMedia?: boolean;
  installedRelatedApps?: Array<{ platform: string; id?: string }>;
}) {
  const storage = createStorage();
  const browserNavigator = {
    userAgent: "Mozilla/5.0 (Linux; Android 14)",
    getInstalledRelatedApps:
      options.installedRelatedApps !== undefined
        ? async () => options.installedRelatedApps
        : undefined,
  };
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: options.standaloneMedia ?? false }),
    navigator: browserNavigator,
    localStorage: storage,
  });
  vi.stubGlobal("navigator", browserNavigator);
  vi.stubGlobal("document", { referrer: "" });
  return storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shouldSuppressInstallPrompt", () => {
  it("supprime la modale en mode standalone", async () => {
    stubBrowser({ standaloneMedia: true });
    await expect(shouldSuppressInstallPrompt()).resolves.toBe(true);
  });

  it("supprime la modale si l’installation a déjà été mémorisée", async () => {
    stubBrowser({});
    rememberPwaInstalled();
    await expect(shouldSuppressInstallPrompt()).resolves.toBe(true);
    expect(wasPwaInstalled()).toBe(true);
  });

  it("supprime la modale si getInstalledRelatedApps renvoie une webapp", async () => {
    stubBrowser({ installedRelatedApps: [{ platform: "webapp", id: "/" }] });
    await expect(shouldSuppressInstallPrompt()).resolves.toBe(true);
  });

  it("laisse la modale possible sur mobile navigateur sans installation", async () => {
    stubBrowser({});
    await expect(shouldSuppressInstallPrompt()).resolves.toBe(false);
  });
});

describe("rememberPwaInstalled", () => {
  it("persiste le flag d’installation", () => {
    const storage = stubBrowser({});
    rememberPwaInstalled();
    expect(storage.getItem(PWA_INSTALLED_KEY)).toBe("1");
    expect(storage.getItem(PWA_INSTALL_DISMISS_KEY)).toBeNull();
  });
});
