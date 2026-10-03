import { describe, expect, it } from "vitest";

import {
  decodeTextBytes,
  mapWorkItemMatrix,
  normalizeWorkUnit,
  parseDelimitedText,
  parseLocaleNumber,
  parseVatRate,
  parseWorkItemsCsv,
  serializeWorkItemsCsv,
} from "./csv";

describe("parseLocaleNumber", () => {
  it.each([
    ["45", 45],
    ["12,5", 12.5],
    ["1 234,50 €", 1234.5],
    ["1.234,50", 1234.5],
    ["1,234.50", 1234.5],
    ["1 234,5 € HT", 1234.5],
    ["12.5", 12.5],
    ["1.234.567", 1234567],
  ])("%s → %s", (raw, expected) => {
    expect(parseLocaleNumber(raw)).toBe(expected);
  });

  it("refuse le texte", () => {
    expect(parseLocaleNumber("sur devis")).toBeNull();
    expect(parseLocaleNumber("")).toBeNull();
  });
});

describe("normalizeWorkUnit / parseVatRate", () => {
  it.each([
    ["m2", "m²"],
    ["M²", "m²"],
    ["m.l.", "ml"],
    ["mètre linéaire", "ml"],
    ["m3", "m³"],
    ["Pce", "U"],
    ["Ens", "U"],
    ["Fft", "forfait"],
    ["heure", "h"],
    ["j", "jour"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeWorkUnit(raw)).toBe(expected);
  });

  it("unité inconnue → null", () => {
    expect(normalizeWorkUnit("palette")).toBeNull();
  });

  it("TVA en %, en fraction Excel ou invalide", () => {
    expect(parseVatRate("20 %")).toBe(20);
    expect(parseVatRate("5,5")).toBe(5.5);
    expect(parseVatRate("0.1")).toBe(10);
    expect(parseVatRate("0,055")).toBe(5.5);
    expect(parseVatRate("19,6")).toBeNull();
  });
});

describe("parseDelimitedText", () => {
  it("gère guillemets, point-virgule et retour à la ligne dans une cellule", () => {
    const text = 'Désignation;Description;Prix\r\n"Pose ; dépose";"Ligne 1\nLigne 2";"12,5"\r\nAutre;"dit ""fort""";3';
    expect(parseDelimitedText(text)).toEqual([
      ["Désignation", "Description", "Prix"],
      ["Pose ; dépose", "Ligne 1\nLigne 2", "12,5"],
      ["Autre", 'dit "fort"', "3"],
    ]);
  });

  it("détecte la tabulation", () => {
    expect(parseDelimitedText("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("decodeTextBytes", () => {
  it("décode le Windows-1252 d'un CSV Excel FR", () => {
    const bytes = new Uint8Array([0x44, 0xe9, 0x73, 0x69, 0x67, 0x6e, 0x61, 0x74, 0x69, 0x6f, 0x6e]); // « Désignation »
    expect(decodeTextBytes(bytes)).toBe("Désignation");
  });

  it("retire le BOM UTF-8", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Unité")]);
    expect(decodeTextBytes(bytes)).toBe("Unité");
  });
});

describe("mapWorkItemMatrix", () => {
  it("reconnaît des en-têtes d'artisan sous une ligne de titre", () => {
    const res = mapWorkItemMatrix([
      ["TARIFS 2026 — SARL Dupont"],
      ["Code", "Désignation", "Famille", "U", "P.U. HT", "Taux TVA"],
      ["CAR-01", "Pose carrelage 60x60", "Carrelage", "m2", "1 045,50 €", "10%"],
      ["", "Plinthes", "Carrelage", "ml", "12", "0,1"],
    ]);
    expect(res.headerFound).toBe(true);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({
      reference: "CAR-01",
      title: "Pose carrelage 60x60",
      category: "Carrelage",
      unit: "m²",
      unit_price_ht: 1045.5,
      default_vat_rate: 10,
    });
    expect(res.rows[1]).toMatchObject({ unit: "ml", default_vat_rate: 10 });
    expect(res.errors).toHaveLength(0);
  });

  it("signale prix illisible, unité et TVA invalides sans bloquer", () => {
    const res = mapWorkItemMatrix([
      ["Désignation", "Unité", "Prix HT", "TVA"],
      ["Dépannage", "palette", "sur devis", "19,6"],
    ]);
    expect(res.rows[0]).toMatchObject({ unit: "U", unit_price_ht: 0, default_vat_rate: 20 });
    expect(res.errors.join(" ")).toMatch(/unité « palette »/);
    expect(res.errors.join(" ")).toMatch(/TVA « 19,6 »/);
    expect(res.errors.join(" ")).toMatch(/prix « sur devis »/);
  });

  it("sans en-tête : ordre de l'export Soline", () => {
    const res = mapWorkItemMatrix([["R1", "Enduit", "", "Façade", "m²", "38", "10", "0", "0", "0"]]);
    expect(res.headerFound).toBe(false);
    expect(res.rows[0]).toMatchObject({ reference: "R1", title: "Enduit", unit_price_ht: 38 });
  });
});

describe("export ↔ import", () => {
  it("l'export se réimporte sans perte, même avec ; et guillemets", () => {
    const csv = serializeWorkItemsCsv([
      {
        reference: "REF-1",
        title: 'Pose "standard" ; dépose',
        description: "Ligne 1\nLigne 2",
        category_name: "Carrelage",
        unit: "m²",
        unit_price_ht: 45.5,
        default_vat_rate: 5.5,
        labor_cost: 30,
        material_cost: 10,
        estimated_hours: 1.5,
      },
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    const { rows, errors } = parseWorkItemsCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0]).toEqual({
      reference: "REF-1",
      title: 'Pose "standard" ; dépose',
      description: "Ligne 1\nLigne 2",
      category: "Carrelage",
      unit: "m²",
      unit_price_ht: 45.5,
      default_vat_rate: 5.5,
      labor_cost: 30,
      material_cost: 10,
      estimated_hours: 1.5,
    });
  });
});
