import { describe, expect, it } from "vitest";

import {
  computeQuoteFormTotals,
  hoursToMinutes,
  laborLineCents,
  lineTotalCents,
  parseEurToCents,
  type LaborLine,
  type MaterialRow,
  type SupplierMaterialRow,
} from "@/lib/quotes/quote-form-totals";

/**
 * Tests de caractérisation du formulaire de devis (refacto latence, point 8).
 * Montants attendus calculés à la main (oracle indépendant du code) : ils
 * figent l'aperçu HT / TVA / TTC affiché à l'artisan et le JSON envoyé au
 * serveur, avant la refonte du rendu en lignes mémoïsées.
 */

const labor = (title: string, hours: string, serviceId: string | null = null): LaborLine => ({
  id: `l-${title}-${hours}`,
  title,
  hours,
  serviceId,
});

const material = (over: Partial<MaterialRow>): MaterialRow => ({
  id: `m-${over.label ?? "x"}`,
  label: "",
  description: "",
  unit: "U",
  vatRate: "",
  quantity: 1,
  unitPriceEur: "",
  supplierUrl: "",
  supplierSku: "",
  excludeFromInvoice: false,
  ...over,
});

const supplier = (over: Partial<SupplierMaterialRow>): SupplierMaterialRow => ({
  id: `s-${over.label ?? "x"}`,
  label: "",
  quantity: 1,
  unitPriceEur: "",
  supplierProductId: "prod-1",
  supplierUrl: "https://fournisseur.example/p/1",
  supplierSku: "SKU1",
  excludeFromInvoice: false,
  similarity: 0.9,
  requestedName: "",
  specifications: null,
  ...over,
});

describe("saisie", () => {
  it("parseEurToCents : virgule, espaces, symboles", () => {
    expect(parseEurToCents("12,50")).toBe(1250);
    expect(parseEurToCents(" 45 € ")).toBe(4500);
    expect(parseEurToCents("45,505")).toBe(4551);
    expect(parseEurToCents("")).toBeNull();
    expect(parseEurToCents("abc")).toBeNull();
  });

  it("hoursToMinutes : décimales à la française", () => {
    expect(hoursToMinutes("2,5")).toBe(150);
    expect(hoursToMinutes("1.25")).toBe(75);
    expect(hoursToMinutes("0")).toBe(0);
    expect(hoursToMinutes("")).toBe(0);
    expect(hoursToMinutes("-3")).toBe(180); // le signe est ignoré par le nettoyage (comportement existant)
  });

  it("totaux de ligne", () => {
    expect(lineTotalCents(3, "12,50")).toBe(3750);
    expect(lineTotalCents(0, "12,50")).toBeNull();
    expect(lineTotalCents(2, "")).toBeNull();
    expect(laborLineCents(4550, 75)).toBe(5688); // 56,875 € arrondi au centime
    expect(laborLineCents(null, 60)).toBeNull();
    expect(laborLineCents(4500, 0)).toBeNull();
  });
});

describe("computeQuoteFormTotals", () => {
  it("main-d'œuvre seule, TVA 10 %", () => {
    const t = computeQuoteFormTotals({
      laborLines: [labor("Pose carrelage", "2,5", "svc-1"), labor("Préparation", "1")],
      materials: [material({})],
      supplierMaterials: [],
      laborRateEur: "45",
      reducedVatRate: "10",
    });
    expect(t.laborLinesPayload).toEqual([
      { title: "Pose carrelage", minutes: 150, service_id: "svc-1" },
      { title: "Préparation", minutes: 60, service_id: null },
    ]);
    expect(t.effectiveLaborMinutes).toBe(210);
    expect(t.laborRateCents).toBe(4500);
    expect(t.laborTotalCents).toBe(15750);
    expect(t.materialsTotalCents).toBe(0);
    expect(t.grandTotalCents).toBe(15750);
    expect(t.documentTotals).toEqual({
      vatBreakdown: [{ rate: 10, baseHtCents: 15750, vatCents: 1575 }],
      totalHtCents: 15750,
      totalVatCents: 1575,
      totalTtcCents: 17325,
    });
    expect(t.materialsPayload).toEqual([]);
  });

  it("TVA mixte, fournisseur, achat direct, lignes incomplètes", () => {
    const t = computeQuoteFormTotals({
      laborLines: [labor("Pose carrelage", "2,5"), labor("Préparation", "1"), labor("", "")],
      materials: [
        material({ label: "Carrelage 60x60", quantity: 3, unitPriceEur: "12,50" }),
        material({ label: "Radiateur", quantity: 1, unitPriceEur: "250", vatRate: "20" }),
        material({
          label: "Mitigeur",
          quantity: 1,
          unitPriceEur: "89",
          excludeFromInvoice: true,
          supplierUrl: " https://brico.example/m ",
          supplierSku: " 123 ",
        }),
        material({ label: "Joint", quantity: 2, unitPriceEur: "" }),
        material({ label: "", quantity: 5, unitPriceEur: "10" }),
      ],
      supplierMaterials: [supplier({ label: "Colle C2", quantity: 2, unitPriceEur: "8,99", requestedName: "colle" })],
      laborRateEur: "45",
      reducedVatRate: "10",
    });

    expect(t.laborTotalCents).toBe(15750);
    // 3 × 12,50 + 250 + 2 × 8,99 (achat direct et lignes sans prix / sans désignation exclus)
    expect(t.materialsTotalCents).toBe(30548);
    expect(t.grandTotalCents).toBe(46298);
    expect(t.supplierDirectTotalCents).toBe(8900);
    expect(t.documentTotals).toEqual({
      vatBreakdown: [
        { rate: 10, baseHtCents: 21298, vatCents: 2130 },
        { rate: 20, baseHtCents: 25000, vatCents: 5000 },
      ],
      totalHtCents: 46298,
      totalVatCents: 7130,
      totalTtcCents: 53428,
    });
    expect(t.materialsPayload).toEqual([
      {
        label: "Carrelage 60x60",
        quantity: 3,
        unit_price_eur: "12,50",
        vat_rate: "10",
        supplier_url: null,
        unit: "U",
        supplier_sku: null,
        is_supplier_catalog: false,
        exclude_from_invoice: false,
      },
      {
        label: "Radiateur",
        quantity: 1,
        unit_price_eur: "250",
        vat_rate: "20",
        supplier_url: null,
        unit: "U",
        supplier_sku: null,
        is_supplier_catalog: false,
        exclude_from_invoice: false,
      },
      {
        label: "Mitigeur",
        quantity: 1,
        unit_price_eur: "89",
        vat_rate: "10",
        supplier_url: "https://brico.example/m",
        unit: "U",
        supplier_sku: "123",
        is_supplier_catalog: false,
        exclude_from_invoice: true,
      },
      {
        label: "Joint",
        quantity: 2,
        unit_price_eur: "",
        vat_rate: "10",
        supplier_url: null,
        unit: "U",
        supplier_sku: null,
        is_supplier_catalog: false,
        exclude_from_invoice: false,
      },
      {
        label: "Colle C2",
        quantity: 2,
        unit_price_eur: "8,99",
        supplier_product_id: "prod-1",
        supplier_url: "https://fournisseur.example/p/1",
        unit: null,
        supplier_sku: "SKU1",
        is_supplier_catalog: true,
        exclude_from_invoice: false,
        vat_rate: "10",
      },
    ]);
  });

  it("TVA 5,5 % et taux horaire décimal", () => {
    const t = computeQuoteFormTotals({
      laborLines: [labor("Isolation combles", "1,25")],
      materials: [],
      supplierMaterials: [],
      laborRateEur: "45,50",
      reducedVatRate: "5.5",
    });
    expect(t.laborTotalCents).toBe(5688);
    expect(t.documentTotals).toEqual({
      vatBreakdown: [{ rate: 5.5, baseHtCents: 5688, vatCents: 313 }],
      totalHtCents: 5688,
      totalVatCents: 313,
      totalTtcCents: 6001,
    });
  });

  it("ligne de main-d'œuvre sans heures : conservée dans le payload (bloque l'envoi)", () => {
    const t = computeQuoteFormTotals({
      laborLines: [labor("Dépose", "")],
      materials: [],
      supplierMaterials: [],
      laborRateEur: "45",
      reducedVatRate: "20",
    });
    expect(t.laborLinesPayload).toEqual([{ title: "Dépose", minutes: 0, service_id: null }]);
    expect(t.laborTotalCents).toBe(0);
    expect(t.documentTotals.totalTtcCents).toBe(0);
  });

  it("taux horaire absent : main-d'œuvre à 0", () => {
    const t = computeQuoteFormTotals({
      laborLines: [labor("Pose", "2")],
      materials: [material({ label: "Plinthe", quantity: 4, unitPriceEur: "7" })],
      supplierMaterials: [],
      laborRateEur: "",
      reducedVatRate: "20",
    });
    expect(t.laborRateCents).toBeNull();
    expect(t.laborTotalCents).toBe(0);
    expect(t.materialsTotalCents).toBe(2800);
    expect(t.documentTotals.totalTtcCents).toBe(3360);
  });

  it("quantité décimale : ligne arrondie au centime, aperçu = PDF", () => {
    const t = computeQuoteFormTotals({
      laborLines: [],
      materials: [],
      supplierMaterials: [supplier({ label: "Enduit", quantity: 2.5, unitPriceEur: "10,01" })],
      laborRateEur: "45",
      reducedVatRate: "20",
    });
    expect(t.materialsTotalCents).toBe(2503);
    expect(t.documentTotals.totalHtCents).toBe(2503);
  });

  it("quantité saisie à plus de 2 décimales : ramenée à 2 décimales (comme en base)", () => {
    const t = computeQuoteFormTotals({
      laborLines: [],
      materials: [],
      supplierMaterials: [supplier({ label: "Béton", quantity: 7.888, unitPriceEur: "162,50" })],
      laborRateEur: "45",
      reducedVatRate: "20",
    });
    expect(t.materialsPayload[0]?.quantity).toBe(7.89);
    // 7,89 × 162,50 € = 1 282,125 € → 128 213 centimes
    expect(t.materialsTotalCents).toBe(128213);
    expect(t.documentTotals.totalHtCents).toBe(128213);
  });
});
