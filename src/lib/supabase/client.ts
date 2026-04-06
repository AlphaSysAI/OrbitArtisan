"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Références **directes** à `process.env.NEXT_PUBLIC_*` (obligatoire) : Next.js ne
 * remplace pas les accès dynamiques `process.env[name]` dans le bundle client, ce qui
 * produit `undefined` et l’erreur « Missing env var » au runtime.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Variables Supabase manquantes côté client (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). Vérifie .env.local et redémarre le serveur.",
    );
  }
  return createBrowserClient(url, anonKey);
}

