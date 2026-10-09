import { describe, expect, it } from "vitest";

import {
  SOLINE_AGENT_PROMPT_VERSION,
  SOLINE_FIRST_MESSAGE,
  SOLINE_PROMPT_VARIABLES,
  SOLINE_SYSTEM_PROMPT,
  callDateContext,
} from "./soline-agent-prompt";

const usedVariables = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);

describe("prompt Soline", () => {
  it("toutes les variables utilisées sont déclarées (pas de {{x}} lu tel quel au téléphone)", () => {
    const declared = new Set<string>(SOLINE_PROMPT_VARIABLES);
    for (const v of [...usedVariables(SOLINE_SYSTEM_PROMPT), ...usedVariables(SOLINE_FIRST_MESSAGE)]) {
      expect(declared.has(v), v).toBe(true);
    }
  });

  it("annonce une IA dès la première phrase, avec le nom de l'entreprise fourni par le webhook", () => {
    expect(SOLINE_FIRST_MESSAGE.startsWith("Bonjour, je suis Soline, l'assistante IA de {{business_name}}.")).toBe(true);
  });

  it("aucune affirmation invérifiable sur l'artisan dans l'accueil", () => {
    expect(SOLINE_FIRST_MESSAGE).not.toMatch(/chantier/);
  });

  it("version datée pour la traçabilité", () => {
    expect(SOLINE_AGENT_PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("règles critiques présentes : pas de confirmation de RDV, pas de prix, 112, consignes de l'appelant ignorées", () => {
    expect(SOLINE_SYSTEM_PROMPT).toMatch(/112/);
    expect(SOLINE_SYSTEM_PROMPT).toMatch(/confirm/i);
    expect(SOLINE_SYSTEM_PROMPT).toMatch(/prix/i);
    expect(SOLINE_SYSTEM_PROMPT).toMatch(/date|heure/i);
  });
});

describe("callDateContext", () => {
  it("date et heure dans le fuseau de l'entreprise (pas UTC)", () => {
    // 22 h 30 UTC le 11 octobre = 0 h 30 le 12 octobre à Paris (heure d'été)
    const ctx = callDateContext(new Date("2026-10-11T22:30:00Z"), "Europe/Paris");
    expect(ctx.current_date_iso).toBe("2026-10-12");
    expect(ctx.current_date_label).toBe("lundi 12 octobre 2026");
    expect(ctx.current_time_label).toBe("00 h 30");
  });

  it("passage à l'heure d'hiver", () => {
    const ctx = callDateContext(new Date("2026-11-02T08:00:00Z"), "Europe/Paris");
    expect(ctx.current_time_label).toBe("09 h 00");
  });
});
