import { describe, expect, it } from "vitest";

import { parseProspectRecords } from "./parse-prospects";
import { readXlsxRows } from "./read-xlsx";
import { resolveProspectTrade } from "./trade-mapping";
import { isFrenchMobile } from "@/lib/phone";

/** Construit un .xlsx minimal (zip « stored », sans compression) pour les tests. */
function buildXlsx(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, "utf8");
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe("readXlsxRows", () => {
  it("lit la première feuille (chaînes partagées, texte inline, nombres)", () => {
    const xlsx = buildXlsx({
      "xl/workbook.xml": '<workbook><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/sharedStrings.xml": "<sst><si><t>name</t></si><si><t>phone</t></si><si><t>Dupont &amp; Fils</t></si></sst>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>latitude</t></is></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>43.21</v></c></row></sheetData></worksheet>',
    });
    expect(readXlsxRows(xlsx)).toEqual([{ name: "Dupont & Fils", phone: "", latitude: "43.21" }]);
  });

  it("refuse un fichier qui n'est pas un zip", () => {
    expect(() => readXlsxRows(Buffer.from("pas un xlsx"))).toThrow();
  });
});

describe("tri des fiches Outscraper", () => {
  it("type principal anglais prioritaire, commerces écartés, requalification par sous-type", () => {
    expect(resolveProspectTrade("Plumber", [])).toMatchObject({ trade: "plombier" });
    expect(resolveProspectTrade("Paint store", ["Paint store", "Wallpaper store"])).toBe("not_artisan");
    expect(resolveProspectTrade("Window supplier", ["Window installation service"])).toMatchObject({ trade: "menuisier-pvc-alu" });
    expect(resolveProspectTrade("Auto body shop", ["Painter"])).toBe("not_artisan");
    expect(resolveProspectTrade("Millwork shop", [])).toMatchObject({ trade: "menuisier-bois" });
    expect(resolveProspectTrade("Artist", ["Painter"])).toBe("not_artisan");
  });

  it("écarte fermés, commerces et doublons ; ne garde que les champs utiles", () => {
    const base = {
      query: "peintre en batiment, 11000, Carcassonne",
      subtypes: "",
      category: "",
      email: "contact@peinture-a.fr",
      "email.emails_validator.status": "RECEIVING",
      full_name: "Jean X",
    };
    const report = parseProspectRecords([
      { ...base, name: "Peinture A", type: "Painter", phone: "+33 6 11 22 33 44", city: "Carcassonne", postal_code: "11000", latitude: "43.2", longitude: "2.35", business_status: "OPERATIONAL" },
      { ...base, name: "Magasin B", type: "Paint store", phone: "+33 4 68 00 00 01", business_status: "OPERATIONAL" },
      { ...base, name: "Fermé C", type: "Painter", phone: "+33 6 99 88 77 66", business_status: "CLOSED_PERMANENTLY" },
      { ...base, name: "Peinture A bis", type: "Painter", phone: "06 11 22 33 44", business_status: "OPERATIONAL" },
    ]);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toEqual({
      business_name: "Peinture A",
      trade: "peintre-batiment",
      trade_category: "second-oeuvre",
      phone: "+33611223344",
      city: "Carcassonne",
      postal_code: "11000",
      latitude: 43.2,
      longitude: 2.35,
      email: "contact@peinture-a.fr",
    });
    expect(report.rejected.map((r) => r.reason)).toEqual(["not_artisan", "closed", "duplicate_in_file"]);
  });
});

describe("e-mail prospect", () => {
  it("retenu seulement si vérifié « RECEIVING » et unique", () => {
    const row = (email: string, status?: string) =>
      parseProspectRecords([
        { name: "Couvreur Z", type: "Roofing contractor", phone: "+33468000000", email, ...(status !== undefined ? { "email.emails_validator.status": status } : {}) },
      ]).rows[0]?.email;
    expect(row("Pro@Couvreur.fr", "RECEIVING")).toBe("pro@couvreur.fr");
    expect(row("pro@couvreur.fr", "INVALID")).toBeNull();
    expect(row("pro@couvreur.fr", "UNKNOWN")).toBeNull();
    expect(row("a@b.fr, c@d.fr", "RECEIVING")).toBeNull();
    expect(row("pro@couvreur.fr")).toBe("pro@couvreur.fr"); // CSV sans vérification : format seul
  });
});

describe("isFrenchMobile", () => {
  it("06/07 uniquement", () => {
    expect(isFrenchMobile("+33612345678")).toBe(true);
    expect(isFrenchMobile("+33468123456")).toBe(false);
    expect(isFrenchMobile("+33912345678")).toBe(false);
  });
});
