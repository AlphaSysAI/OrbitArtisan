import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseProspectFile, parseProspectRecords, type ParseReport, type ProspectInput } from "@/lib/concierge/parse-prospects";
import { readXlsxRows } from "@/lib/files/read-xlsx";
import { searchBanAddresses } from "@/lib/geo/ban";

export const PROSPECT_IMPORT_MAX_BYTES = 4 * 1024 * 1024;

export type ImportResult = {
  total: number;
  inserted: number;
  alreadyKnown: number;
  notGeocoded: number;
  rejected: ParseReport["rejected"];
};

/** Commune (CP + ville) → coordonnées du centre, 1 appel BAN par commune distincte. */
async function geocodeCommunes(rows: ProspectInput[], budgetMs: number): Promise<void> {
  const started = Date.now();
  const missing = rows.filter((r) => r.latitude === null && (r.postal_code || r.city));
  const byKey = new Map<string, ProspectInput[]>();
  for (const r of missing) {
    const k = `${r.postal_code ?? ""} ${r.city ?? ""}`.trim().toLowerCase();
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const keys = [...byKey.keys()].slice(0, 400);
  for (let i = 0; i < keys.length; i += 5) {
    if (Date.now() - started > budgetMs) break;
    await Promise.all(
      keys.slice(i, i + 5).map(async (k) => {
        const [hit] = await searchBanAddresses(k, { limit: 1, signal: AbortSignal.timeout(4000) });
        if (!hit) return;
        for (const r of byKey.get(k)!) {
          r.latitude = hit.latitude;
          r.longitude = hit.longitude;
        }
      }),
    );
  }
}

/**
 * Import sécurisé (admin uniquement, service role) : parse, géocode par commune,
 * insère sans JAMAIS écraser une fiche existante (statut, notes et désinscription
 * RGPD d'un prospect déjà connu sont conservés : dédoublonnage sur le téléphone).
 */
export async function importProspects(
  db: SupabaseClient,
  input: { content: string | Buffer; format: "csv" | "json" | "xlsx"; source: string },
): Promise<ImportResult> {
  const report =
    input.format === "xlsx"
      ? parseProspectRecords(readXlsxRows(Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content)))
      : parseProspectFile(String(input.content), input.format);
  await geocodeCommunes(report.rows, 35_000);

  const phones = report.rows.map((r) => r.phone);
  const known = new Set<string>();
  for (let i = 0; i < phones.length; i += 500) {
    const { data } = await db.from("prospect_artisans").select("phone").in("phone", phones.slice(i, i + 500));
    for (const d of data ?? []) known.add(d.phone as string);
  }

  const fresh = report.rows.filter((r) => !known.has(r.phone));
  let inserted = 0;
  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500).map((r) => ({ ...r, source: input.source.slice(0, 120) }));
    const { data, error } = await db
      .from("prospect_artisans")
      .upsert(chunk, { onConflict: "phone", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`insert:${error.message}`);
    inserted += data?.length ?? 0;
  }

  return {
    total: report.total,
    inserted,
    alreadyKnown: report.rows.length - fresh.length,
    notGeocoded: fresh.filter((r) => r.latitude === null).length,
    rejected: report.rejected,
  };
}
