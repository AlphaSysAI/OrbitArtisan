import { describe, expect, it } from "vitest";

import { parseProspectFile } from "./parse-prospects";
import { mapTrade } from "./trade-mapping";

describe("mapTrade", () => {
  it("annuaire → nomenclature", () => {
    expect(mapTrade("Plombier chauffagiste")).toEqual({ trade: "plombier-chauffagiste", category: "plomberie-chauffage" });
    expect(mapTrade("Entreprise de maçonnerie")?.trade).toBe("macon");
    expect(mapTrade("Electrician")?.trade).toBe("electricien");
    expect(mapTrade("Menuiserie PVC et alu")?.trade).toBe("menuisier-pvc-alu");
    expect(mapTrade("carreleur")?.trade).toBe("carreleur");
    expect(mapTrade("Boulangerie")).toBeNull();
  });
});

describe("parseProspectFile", () => {
  const csv = `name;category;phone;email;reviews;city;postal_code;latitude;longitude
"Dupont Plomberie";Plombier;06 12 34 56 78;contact@dupont.fr;4,8;Carcassonne;11000;43,21;2,35
Martin Élec;Électricien;+33 4 68 00 00 00;;;Limoux;11300;;
Doublon SARL;Plombier;0612345678;;;Carcassonne;11000;;
Sans Tel;Maçon;;;;Narbonne;11100;;
Boulangerie Paul;Boulangerie;0611111111;;;Narbonne;11100;;`;

  it("ne garde que les colonnes utiles, normalise et dédoublonne sur le téléphone", () => {
    const r = parseProspectFile(csv, "csv");
    expect(r.total).toBe(5);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({
      business_name: "Dupont Plomberie",
      trade: "plombier",
      trade_category: "plomberie-chauffage",
      phone: "+33612345678",
      city: "Carcassonne",
      postal_code: "11000",
      latitude: 43.21,
      longitude: 2.35,
    });
    expect(Object.keys(r.rows[0]!)).not.toContain("email");
    expect(r.rows[1]).toMatchObject({ phone: "+33468000000", latitude: null });
    expect(r.rejected.map((x) => x.reason)).toEqual(["duplicate_in_file", "invalid_phone", "unknown_trade"]);
  });

  it("JSON (tableau ou { data: [] })", () => {
    const r = parseProspectFile(JSON.stringify({ data: [{ title: "Toitures 11", categoryName: "Couvreur", phone: "0468112233", postcode: "11000" }] }), "json");
    expect(r.rows[0]).toMatchObject({ business_name: "Toitures 11", trade: "couvreur", phone: "+33468112233", postal_code: "11000" });
  });
});
