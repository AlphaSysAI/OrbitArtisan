import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ACCOUNTING_UPLOADS_BUCKET, displayNameFromStorageName } from "@/lib/accounting/export-schedule";

export const ACCOUNTING_EXPORT_PAGE_PATH = "/app/invoices/envoi-comptable";

type PendingPiece = { path: string; name: string; size: number };

/**
 * Pièces ajoutées par l'artisan, en attente du prochain envoi. Lecture directe du
 * stockage (aucune table) : une pièce supprimée n'existe plus nulle part.
 */
export async function listPendingPieces(db: SupabaseClient, profileId: string): Promise<PendingPiece[]> {
  const { data, error } = await db.storage
    .from(ACCOUNTING_UPLOADS_BUCKET)
    .list(profileId, { limit: 100, sortBy: { column: "name", order: "asc" } });
  if (error) {
    console.error("[accounting] liste des pièces", profileId, error.message);
    return [];
  }
  return (data ?? [])
    .filter((o) => o.id && o.name)
    .map((o) => ({
      path: `${profileId}/${o.name}`,
      name: displayNameFromStorageName(o.name),
      size: Number((o.metadata as { size?: number } | null)?.size ?? 0),
    }));
}
