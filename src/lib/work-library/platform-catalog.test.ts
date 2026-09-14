import { describe, expect, it } from "vitest";

import {
  filterPlatformCatalog,
  getPlatformCatalogItem,
  searchPlatformCatalog,
} from "@/lib/work-library/platform-catalog";
import { PLATFORM_WORK_CATALOG } from "@/lib/work-library/platform-catalog-data";
import { TRADE_CATEGORIES } from "@/lib/trades/taxonomy";

describe("filterPlatformCatalog", () => {
  it("retourne une liste vide sans catégorie métier", () => {
    expect(filterPlatformCatalog(null, "plombier")).toEqual([]);
    expect(filterPlatformCatalog(undefined, "plombier")).toEqual([]);
  });

  it("filtre par catégorie et métier précis", () => {
    const items = filterPlatformCatalog("plomberie-chauffage", "plombier");
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.tradeCategoryId === "plomberie-chauffage")).toBe(true);
    expect(items.every((i) => i.tradeIds.length === 0 || i.tradeIds.includes("plombier"))).toBe(true);
    expect(items.some((i) => i.id === "pc-wc-suspendu")).toBe(true);
  });

  it("inclut les ouvrages transverses sans tradeIds pour la catégorie", () => {
    const items = filterPlatformCatalog("gros-oeuvre", "macon");
    expect(items.some((i) => i.id === "go-demol-cloison")).toBe(true);
  });

  it("exclut les ouvrages d'une autre catégorie", () => {
    const items = filterPlatformCatalog("electricite", "electricien");
    expect(items.some((i) => i.tradeCategoryId === "plomberie-chauffage")).toBe(false);
  });
});

describe("searchPlatformCatalog", () => {
  it("recherche dans le périmètre métier", () => {
    const hits = searchPlatformCatalog("second-oeuvre", "peintre-batiment", "peinture");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.title.toLowerCase()).toContain("peinture");
  });
});

describe("PLATFORM_WORK_CATALOG", () => {
  it("a des références uniques", () => {
    const refs = PLATFORM_WORK_CATALOG.map((i) => i.reference);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("getPlatformCatalogItem résout par id", () => {
    const item = getPlatformCatalogItem("el-point-lumiere");
    expect(item?.reference).toBe("EL-001");
  });

  it("couvre chaque catégorie métier avec au moins un ouvrage", () => {
    for (const category of TRADE_CATEGORIES) {
      const count = PLATFORM_WORK_CATALOG.filter((i) => i.tradeCategoryId === category.id).length;
      expect(count, `catégorie ${category.id}`).toBeGreaterThan(0);
    }
  });

  it("chaque métier a au moins un ouvrage visible dans sa catégorie", () => {
    for (const category of TRADE_CATEGORIES) {
      for (const trade of category.trades) {
        const visible = filterPlatformCatalog(category.id, trade.id);
        expect(
          visible.length,
          `${category.id} / ${trade.id}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
