"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Client Supabase navigateur chargé à la demande (perf) : supabase-js +
 * Realtime (~53 KB gz) ne sont téléchargés que lorsqu'un composant en a
 * réellement besoin (fil de messages ouvert), pas au chargement de la page.
 */
export function getBrowserSupabase(): Promise<SupabaseClient> {
  clientPromise ??= import("@/lib/supabase/client")
    .then((m) => m.createSupabaseBrowserClient())
    .catch((error: unknown) => {
      clientPromise = null; // réessai possible (réseau instable)
      throw error;
    });
  return clientPromise;
}
