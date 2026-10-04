import { describe, expect, it } from "vitest";

import {
  buildGeometryContext,
  computeHouseStructuralShell,
  computeMasonryBlockCount,
  detectMasonryMaterial,
  extractHouseFloorArea,
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

describe("géométrie imposée et matériau demandé", () => {
  const artisan = (tradeLabel: string | null) => ({ audience: "artisan" as const, tradeLabel });

  it("brique citée → brique, jamais parpaing ; parpaing seulement si cité", () => {
    expect(detectMasonryMaterial("construction maison neuve 130m2 au plancher, brique rouge")).toBe("brique");
    expect(detectMasonryMaterial("murs en Calibric de 20")).toBe("brique");
    expect(detectMasonryMaterial("mur en parpaing de 10 ml")).toBe("parpaing");
    expect(detectMasonryMaterial("maison neuve 130 m2")).toBeNull();
  });

  it("lit la surface de la maison (plain-pied ou étage)", () => {
    expect(extractHouseFloorArea("besoin d'un devis pour Florian, construction maison neuve 130m2 au plancher")).toEqual({
      floorAreaM2: 130,
      footprintM2: 130,
      levels: 1,
      atticRooms: false,
    });
    expect(extractHouseFloorArea("maison de 140 m² avec étage")).toEqual({
      floorAreaM2: 140,
      footprintM2: 70,
      levels: 2,
      atticRooms: false,
    });
    expect(extractHouseFloorArea("toiture neuve 135 m2")).toBeNull();
  });

  it("régression : maison 130 m² brique → ~49 ml et ~101 m² de murs en brique (pas 114 ml / 228 m²)", () => {
    const ctx = buildGeometryContext(
      "besoin d'un devis pour Florian Lapertot, construction maison neuve 130m2 au plancher, brique rouge",
      artisan("Gros œuvre & structure · Maçon"),
    );
    expect(ctx.walls).toMatchObject({ material: "brique", perimeterLinearMeters: 49.3, netWallAreaM2: 101.1 });
    expect(ctx.roofAreaM2).toBeNull(); // maçon : pas de toiture déduite
  });

  it("toiture calculée pour un couvreur ou un particulier, jamais si la surface de toiture est donnée", () => {
    expect(buildGeometryContext("maison neuve 130 m2", artisan("Couverture & toiture · Couvreur")).roofAreaM2).toBe(154.3);
    expect(buildGeometryContext("maison neuve 130 m2", { audience: "client" }).walls?.material).toBe("parpaing");
    expect(buildGeometryContext("maison 130 m2, 160 m2 de toiture tuiles", { audience: "client" }).roofAreaM2).toBeNull();
  });
});

describe("gros œuvre maison neuve chaîné", () => {
  const macon = { audience: "artisan" as const, tradeLabel: "Gros œuvre & structure · Maçon" };

  it("chaîne fouilles, semelles, dallage et murs sur la géométrie calculée", () => {
    const ctx = buildGeometryContext("construction maison neuve 130m2 au plancher, brique rouge", macon);
    expect(ctx.structuralShell).toBe(true);
    expect(ctx.extraLots).toBe(false);
    const shell = computeHouseStructuralShell(ctx)!;
    const qty = (name: string) => shell.materials.find((m) => m.name_generic.startsWith(name))?.quantity;
    expect(qty("Armature semelle filante")).toBe(51.77); // 49,3 ml × 1,05
    expect(qty("Treillis soudé ST25C")).toBe(149.5); // dallage 130 m² × 1,15
    expect(qty("Brique creuse de structure")).toBe(688); // 101,1 m² × 6,8
    expect(shell.materials.some((m) => /parpaing/i.test(m.name_generic))).toBe(false);
    expect(shell.laborPhases).toHaveLength(12);
    // 49,3 × 0,25 + 49,3 × 0,55 + 130 × 0,5 + 101,1 × 1,05
    expect(shell.laborHours).toBeCloseTo(12.3 + 27.1 + 65 + 106.2, 1);
  });

  it("autres lots nommés → le modèle complète ; « murs porteurs » n'en est pas un", () => {
    expect(buildGeometryContext("maison neuve 120 m2 avec murs porteurs", macon).extraLots).toBe(false);
    expect(buildGeometryContext("maison neuve 120 m2 avec enduit de façade", macon).extraLots).toBe(true);
    expect(buildGeometryContext("maison neuve 120 m2", { audience: "artisan", tradeLabel: "Couvreur" }).structuralShell).toBe(false);
  });
});

describe("béton fusionné, plain-pied", () => {
  it("130 m² plain-pied : 27,32 m³ en une ligne (et non 8 + 17 + 3 = 28 m³ arrondis séparément)", () => {
    const macon = { audience: "artisan" as const, tradeLabel: "Gros œuvre & structure · Maçon" };
    const shell = computeHouseStructuralShell(buildGeometryContext("maison neuve 130 m2 en parpaing", macon))!;
    const beton = shell.materials.filter((m) => /^b[ée]ton/i.test(m.name_generic));
    expect(beton).toHaveLength(1);
    // 49,3 × 0,16 = 7,89 + 130 × 0,13 = 16,9 + 101,1 × 0,025 = 2,53
    expect(beton[0]!.quantity).toBe(27.32);
  });
});

describe("maison à étage (R+1)", () => {
  const macon = { audience: "artisan" as const, tradeLabel: "Gros œuvre & structure · Maçon" };

  it("130 m² R+1 : emprise 65 m², murs sur 5,00 m, plancher intermédiaire 65 m²", () => {
    const ctx = buildGeometryContext("construction maison neuve 130 m2 R+1 en parpaing", macon);
    expect(ctx.house).toEqual({ floorAreaM2: 130, footprintM2: 65, levels: 2, atticRooms: false });
    // périmètre 4 × √65 × 1,08 = 34,8 ml ; 34,8 × 5,00 = 174 m² bruts − 18 % = 142,7 m² nets
    expect(ctx.walls).toMatchObject({ perimeterLinearMeters: 34.8, heightM: 5, grossWallAreaM2: 174, netWallAreaM2: 142.7 });

    const shell = computeHouseStructuralShell(ctx)!;
    const qty = (name: string) => shell.materials.find((m) => m.name_generic.startsWith(name))?.quantity;
    expect(qty("Poutrelles béton précontraint")).toBe(65);
    expect(qty("Treillis soudé ST25C")).toBe(74.75); // dallage RDC 65 m² × 1,15
    expect(qty("Armature semelle filante")).toBe(36.54); // 34,8 ml × 1,05
    expect(shell.laborPhases.some((p) => p.title.startsWith("Étaiement, pose des poutrelles"))).toBe(true);
    expect(shell.laborPhases).toHaveLength(15);
  });

  it("béton toupie fusionné en une seule ligne (semelles + dallage + table de compression + chaînages)", () => {
    const shell = computeHouseStructuralShell(buildGeometryContext("construction maison neuve 130 m2 R+1 en parpaing", macon))!;
    const beton = shell.materials.filter((m) => /^b[ée]ton/i.test(m.name_generic));
    expect(beton).toHaveLength(1);
    // 5,57 (semelles) + 8,45 (dallage) + 3,90 (table) + 3,57 (chaînages)
    expect(beton[0]).toMatchObject({ name_generic: "Béton prêt à l'emploi C25/30 en toupie", unit: "m³", quantity: 21.49 });
    expect(beton[0]!.specifications).toMatch(/Semelles filantes, classe XC2.*Dallage.*Table de compression.*Chaînages/);
  });

  it("détecte étage / 2 niveaux / combles aménagés, et respecte « plain-pied »", () => {
    expect(extractHouseFloorArea("maison neuve 130 m2 à étage")?.levels).toBe(2);
    expect(extractHouseFloorArea("maison neuve 130 m2 sur 2 niveaux")?.levels).toBe(2);
    expect(extractHouseFloorArea("maison 120 m2 avec combles aménagés")).toMatchObject({ levels: 2, atticRooms: true });
    expect(extractHouseFloorArea("maison plain-pied 130 m2")?.levels).toBe(1);
    const attic = buildGeometryContext("construction maison neuve 120 m2 combles aménagés", macon);
    expect(attic.walls?.heightM).toBe(3.5);
  });
});
