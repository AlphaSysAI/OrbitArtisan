import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Limitation de débit des parcours publics (estimation, prise de RDV, IA publique,
 * signature de bon d'intervention). Clé = IP hachée (jamais stockée en clair, RGPD).
 * Fenêtre glissante en base (rate_limit_events, service role uniquement).
 *
 * Disponibilité d'abord : si la base ne répond pas, la requête passe (et c'est loggé).
 */

type RateLimitRule = { bucket: string; max: number; windowSeconds: number };

export const RATE_LIMITS = {
  leadCreate: { bucket: "lead_create", max: 8, windowSeconds: 3600 },
  leadUpload: { bucket: "lead_upload", max: 30, windowSeconds: 3600 },
  leadAi: { bucket: "lead_ai", max: 40, windowSeconds: 3600 },
  leadContact: { bucket: "lead_contact", max: 8, windowSeconds: 3600 },
  estimationChat: { bucket: "estimation_chat", max: 80, windowSeconds: 3600 },
  vitrineBooking: { bucket: "vitrine_booking", max: 6, windowSeconds: 3600 },
  workOrderSign: { bucket: "work_order_sign", max: 10, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>;

function hashKey(key: string): string {
  const pepper = process.env.APPOINTMENT_LINK_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  return createHash("sha256").update(`${pepper}:${key}`).digest("hex").slice(0, 40);
}

/** IP du client (Vercel écrase x-real-ip / x-forwarded-for : non falsifiables côté client). */
export function ipFromHeaders(h: Headers): string {
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

async function currentRequestIp(): Promise<string> {
  return ipFromHeaders(await headers());
}

/** true = autorisé (et comptabilisé), false = limite atteinte. */
export async function consumeRateLimit(rule: RateLimitRule, key: string, db?: SupabaseClient | null): Promise<boolean> {
  const client = db ?? createSupabaseServiceRoleClient();
  if (!client) return true;
  const keyHash = hashKey(key);
  const since = new Date(Date.now() - rule.windowSeconds * 1000).toISOString();

  const { count, error } = await client
    .from("rate_limit_events")
    .select("id", { count: "exact", head: true })
    .eq("bucket", rule.bucket)
    .eq("key_hash", keyHash)
    .gte("created_at", since);
  if (error) {
    console.error("[rate-limit]", rule.bucket, error.message);
    return true;
  }
  if ((count ?? 0) >= rule.max) return false;

  await client.from("rate_limit_events").insert({ bucket: rule.bucket, key_hash: keyHash });
  // Purge opportuniste (1 % des appels) : fenêtres ≤ 1 jour.
  if (Math.random() < 0.01) {
    await client.from("rate_limit_events").delete().lt("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString());
  }
  return true;
}

/** Raccourci pour les server actions : limite par IP de la requête en cours. */
export async function allowRequest(rule: RateLimitRule, db?: SupabaseClient | null): Promise<boolean> {
  return consumeRateLimit(rule, await currentRequestIp(), db);
}
