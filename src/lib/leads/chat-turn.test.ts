import { describe, expect, it } from "vitest";

import type { LeadChatMessage } from "@/lib/leads/chat-schema";
import { formatLeadDescription, normalizeChatTurn } from "@/lib/leads/chat-turn";

describe("normalizeChatTurn", () => {
  it("impose une première question même si l'IA veut terminer", () => {
    const result = normalizeChatTurn(
      { question: null, done: true, summary: "Je dois refaire ma salle de bain." },
      0,
      "Plomberie",
      [],
    );
    expect(result.done).toBe(false);
    expect(result.question).toBeTruthy();
  });

  it("refuse la clôture avant 3 réponses", () => {
    const messages: LeadChatMessage[] = [
      { role: "assistant", content: "Quel est le problème ?" },
      { role: "user", content: "Fuite sous l'évier" },
    ];
    const result = normalizeChatTurn(
      { question: null, done: true, summary: "Fuite sous l'évier." },
      1,
      "Plomberie",
      messages,
    );
    expect(result.done).toBe(false);
    expect(result.question).toBeTruthy();
  });

  it("termine quand une question est absente après le minimum", () => {
    const messages: LeadChatMessage[] = [
      { role: "assistant", content: "Q1" },
      { role: "user", content: "R1" },
      { role: "assistant", content: "Q2" },
      { role: "user", content: "R2" },
      { role: "assistant", content: "Q3" },
      { role: "user", content: "R3" },
    ];
    const result = normalizeChatTurn(
      { question: null, done: true, summary: "Besoin détaillé." },
      3,
      "Plomberie",
      messages,
    );
    expect(result.done).toBe(true);
    expect(result.question).toBeNull();
  });
});

describe("formatLeadDescription", () => {
  it("ajoute le fil Q/R pour l'artisan", () => {
    const text = formatLeadDescription("Je dois réparer une fuite.", [
      { role: "assistant", content: "Où est la fuite ?" },
      { role: "user", content: "Sous l'évier cuisine" },
      { role: "assistant", content: "Depuis quand ?" },
      { role: "user", content: "Depuis hier" },
    ]);
    expect(text).toContain("Précisions recueillies");
    expect(text).toContain("Sous l'évier cuisine");
  });
});
