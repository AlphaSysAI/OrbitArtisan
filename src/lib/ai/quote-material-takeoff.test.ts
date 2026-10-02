import { describe, expect, it } from "vitest";

import {
  computeMasonryBlockCount,
  isWholeHouseMasonryProject,
  MASONRY_BLOCKS_PER_M2,
  needsMaterialTakeoff,
} from "./quote-material-takeoff";

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

describe("computeMasonryBlockCount", () => {
  it("applique le ratio standard (10 blocs/m²) + 5 % de chute", () => {
    // Régression : le LLM avait sorti 13000 parpaings pour une maison dont le bon
    // ordre de grandeur est 1300 — le calcul doit désormais être déterministe,
    // jamais recalculé par le modèle.
    expect(computeMasonryBlockCount(124)).toBe(Math.ceil(124 * MASONRY_BLOCKS_PER_M2 * 1.05));
    expect(computeMasonryBlockCount(124)).toBe(1302);
  });

  it("arrondit toujours à l'entier supérieur", () => {
    // 1 x 10 x 1.05 = 10.5 -> 11, pas 10.5 ni 10
    expect(computeMasonryBlockCount(1)).toBe(11);
  });

  it("reste cohérent pour une petite surface (mur simple)", () => {
    expect(computeMasonryBlockCount(20)).toBe(210);
  });
});

describe("needsMaterialTakeoff — corps d'état et langage profane", () => {
  it.each([
    "135m2 de toiture neuve tuile et ossature bois",
    "135 m² de toiture neuve",
    "Peinture des murs et plafond du salon",
    "peindre une chambre de 12 m2",
    "Pose placo BA13 cloison 15 ml hauteur 2,50 m",
    "isolation des combles perdus 80 m²",
    "carrelage salle de bain 8 m2",
    "Pose parquet stratifié dans tout l'appartement",
    "rénovation électrique complète de la maison, tableau électrique et prises",
    "refaire les tuyaux de la maison en multicouche",
    "terrasse bois de 20 m2",
    "je veux refaire le toit de ma maison, environ 100 m2",
    "séparer une pièce en deux, longueur 4 mètres",
  ])("déclenche : %s", (text) => {
    expect(needsMaterialTakeoff(text)).toBe(true);
  });

  it.each([
    "recherche de fuite sous l'évier",
    "remplacement mitigeur cuisine",
    "débouchage wc bouché",
    "changement disjoncteur qui saute",
    "changer 3 tuiles cassées sur le toit de la maison",
    "chauffe-eau en panne dans l'appartement",
    "devis pour M. Dupont, rénovation salle de bain",
    "prévoir un per pour plus tard",
  ])("ne déclenche pas : %s", (text) => {
    expect(needsMaterialTakeoff(text)).toBe(false);
  });
});
