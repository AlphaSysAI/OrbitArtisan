import { describe, expect, it } from "vitest";

import { exactCatalogService, laborItemsFromAi, scaleLaborItems } from "./ai-labor-items";

describe("ai-labor-items", () => {
  it("convertit les heures IA en minutes et ignore les lignes vides", () => {
    expect(
      laborItemsFromAi([
        { description: "Pose charpente fermette", quantity: 40 },
        { description: "  ", quantity: 3 },
        { description: "Pose tuiles", quantity: 0 },
      ]),
    ).toEqual([{ title: "Pose charpente fermette", minutes: 2400 }]);
  });

  it("ramène les phases au total en conservant la somme exacte", () => {
    const scaled = scaleLaborItems(
      [
        { title: "A", minutes: 2400 },
        { title: "B", minutes: 3000 },
        { title: "C", minutes: 2700 },
      ],
      7200,
    );
    expect(scaled.reduce((a, i) => a + i.minutes, 0)).toBe(7200);
    expect(scaled.map((i) => i.minutes)).toEqual([2130, 2670, 2400]);
  });

  it("ne rattache une prestation catalogue qu'en cas de libellé identique", () => {
    const catalog = [{ id: "1", title: "Pose de piscine" }, { id: "2", title: "Pose écran sous-toiture" }];
    expect(exactCatalogService(catalog, "pose ecran sous-toiture")?.id).toBe("2");
    expect(exactCatalogService(catalog, "Pose tuiles et faîtage")).toBeNull();
  });
});
