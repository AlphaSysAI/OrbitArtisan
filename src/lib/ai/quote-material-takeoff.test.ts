import { describe, expect, it } from "vitest";

import { isWholeHouseMasonryProject, needsMaterialTakeoff } from "./quote-material-takeoff";

describe("needsMaterialTakeoff", () => {
  it("active le métré pour un mur dimensionné", () => {
    expect(
      needsMaterialTakeoff(
        "mon client a besoin d'un mur en parpaing de 10m linéaire sur 2m de haut",
      ),
    ).toBe(true);
  });

  it("ignore une phrase sans dimensions", () => {
    expect(needsMaterialTakeoff("devis pour M. Dupont, rénovation salle de bain")).toBe(false);
  });

  it("active pour dimensions en 10 x 2", () => {
    expect(needsMaterialTakeoff("mur agglo 10 x 2 m")).toBe(true);
  });

  it("active pour maison neuve sans surface explicite", () => {
    expect(
      needsMaterialTakeoff(
        "construction d'une maison neuve par le maçon : plancher, murs porteurs et toiture",
      ),
    ).toBe(true);
  });
});

describe("isWholeHouseMasonryProject", () => {
  it("détecte gros œuvre maison", () => {
    expect(isWholeHouseMasonryProject("maison neuve murs porteurs")).toBe(true);
  });
});
