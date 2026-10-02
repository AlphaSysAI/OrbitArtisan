import { describe, expect, it } from "vitest";

import { extractCustomerHintFromMessage } from "./assistant-quote-intake";

describe("extractCustomerHintFromMessage", () => {
  it.each([
    ["devis pour Loic, construction des murs de 20 m2", "Loic"],
    ["devis pour Loïc; toiture 135 m2", "Loïc"],
    ["fais un devis pour Loïc Martin qui veut refaire sa toiture", "Loïc Martin"],
    ["devis pour Jean-Pierre Durand avec pose de placo", "Jean-Pierre Durand"],
    ["devis pour M. Dupont. Carrelage 12 m2", "M. Dupont"],
    ["devis pour Mme Garcia - peinture salon", "Mme Garcia"],
    ["nouveau devis pour Paul concernant la terrasse", "Paul"],
    ["devis chez Durand construction d'un mur", "Durand"],
  ])("%s → %s", (message, expected) => {
    expect(extractCustomerHintFromMessage(message)).toBe(expected);
  });

  it("ignore « pour un autre client » et l'absence de nom", () => {
    expect(extractCustomerHintFromMessage("devis pour un autre client, toiture 50 m2")).toBeNull();
    expect(extractCustomerHintFromMessage("devis pour, construction d'un mur")).toBeNull();
  });
});
