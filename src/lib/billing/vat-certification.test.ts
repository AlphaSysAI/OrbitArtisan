import { describe, expect, it } from "vitest";

import { vatCertificationLines, vatCertificationScope } from "./vat-certification";

describe("certification TVA taux réduit", () => {
  it("n'est requise qu'avec une ligne à 10 % ou 5,5 %", () => {
    expect(vatCertificationScope([20, 20]).required).toBe(false);
    expect(vatCertificationScope([20, 10])).toEqual({ required: true, energy: false });
    expect(vatCertificationScope([5.5, 20])).toEqual({ required: true, energy: true });
    expect(vatCertificationScope([0, 0]).required).toBe(false);
  });

  it("ajoute la rénovation énergétique pour le 5,5 % et l'adresse du chantier", () => {
    const standard = vatCertificationLines({ required: true, energy: false }, "12 rue des Lilas, 81100 Castres");
    const energy = vatCertificationLines({ required: true, energy: true });
    expect(standard[0]).toContain("12 rue des Lilas");
    expect(standard.join(" ")).not.toContain("278-0 bis A");
    expect(energy.join(" ")).toContain("278-0 bis A");
    expect(vatCertificationLines({ required: false, energy: false })).toEqual([]);
  });
});
