/**
 * Polices et profil couleur embarqués dans les PDF (devis, factures).
 *
 * Inter (SIL OFL 1.1, voir src/assets/fonts/Inter-LICENSE.txt) est intégrée et
 * sous-ensemblée dans chaque document : rendu identique partout et condition
 * PDF/A-3 (Factur-X) — les 14 polices standard PDF ne sont PAS embarquées.
 *
 * Repli : si les fichiers sont introuvables au runtime (bundle mal tracé),
 * on génère quand même le document en Helvetica plutôt que de bloquer une
 * facture. L'erreur est journalisée pour correction.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

export type EmbeddedFonts = { regular: PDFFont; bold: PDFFont; embedded: boolean };

const FONT_DIR = path.join(process.cwd(), "src", "assets", "fonts");
const ICC_PATH = path.join(process.cwd(), "src", "assets", "color", "sRGB-IEC61966-2.1.icc");

let cachedFonts: { regular: Uint8Array; bold: Uint8Array } | null | undefined;
let cachedIcc: Uint8Array | null | undefined;

function readFonts(): { regular: Uint8Array; bold: Uint8Array } | null {
  if (cachedFonts !== undefined) return cachedFonts;
  try {
    cachedFonts = {
      regular: new Uint8Array(readFileSync(path.join(FONT_DIR, "Inter-Regular.ttf"))),
      bold: new Uint8Array(readFileSync(path.join(FONT_DIR, "Inter-SemiBold.ttf"))),
    };
  } catch (error) {
    console.error("[pdf-fonts] polices Inter introuvables, repli Helvetica", error);
    cachedFonts = null;
  }
  return cachedFonts;
}

export async function embedDocumentFonts(pdf: PDFDocument): Promise<EmbeddedFonts> {
  const bytes = readFonts();
  if (bytes) {
    try {
      pdf.registerFontkit(fontkit);
      return {
        regular: await pdf.embedFont(bytes.regular, { subset: true }),
        bold: await pdf.embedFont(bytes.bold, { subset: true }),
        embedded: true,
      };
    } catch (error) {
      console.error("[pdf-fonts] intégration Inter impossible, repli Helvetica", error);
    }
  }
  return {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    embedded: false,
  };
}

/** Profil sRGB (domaine public, Argyll CMS) pour l'OutputIntent PDF/A. */
export function readSrgbIccProfile(): Uint8Array | null {
  if (cachedIcc !== undefined) return cachedIcc;
  try {
    cachedIcc = new Uint8Array(readFileSync(ICC_PATH));
  } catch (error) {
    console.error("[pdf-fonts] profil ICC sRGB introuvable", error);
    cachedIcc = null;
  }
  return cachedIcc;
}
