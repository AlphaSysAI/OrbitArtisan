import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import twilio from "twilio";

import type { SubscriptionStatus } from "@/lib/billing/subscription-access";
import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { syncSubscriptionVoiceNumber } from "@/lib/voice/subscription-voice-number-sync";
import { addVoiceNumberToPool } from "@/lib/voice/voice-number-pool";
import { clampBulkCount, computeRefillCount, readRefillPolicy } from "@/lib/voice/voice-pool-refill";

/**
 * Provisionnement d'un numéro Soline de bout en bout :
 *   1. achat d'un numéro français sur Twilio (dossier réglementaire FR requis) ;
 *   2. import dans ElevenLabs + assignation de l'agent Soline ;
 *   3. URL de statut d'appel reposée sur le numéro (l'import ElevenLabs réécrit la config) ;
 *   4. ajout au pool (« ElevenLabs prêt » seulement si l'étape 2 a réussi).
 * Un numéro acheté n'est jamais relâché automatiquement : en cas d'échec ElevenLabs,
 * il entre au pool non prêt et se répare avec « Réessayer ElevenLabs ».
 */

type NumberType = "local" | "national" | "mobile";

export type ProvisioningConfig = {
  accountSid: string;
  authToken: string;
  bundleSid: string;
  addressSid: string;
  numberType: NumberType;
  statusCallbackUrl: string;
  elevenlabsApiKey: string;
  elevenlabsAgentId: string;
  elevenlabsBaseUrl: string;
  /** Identifiants Twilio transmis à ElevenLabs (clé API conseillée, sinon compte). */
  elevenlabsTwilioSid: string;
  elevenlabsTwilioToken: string;
};

export type ProvisionResult =
  | { ok: true; phoneE164: string; elevenlabsReady: boolean; warning?: string }
  | { ok: false; error: string };

const REQUIRED_ENV = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FR_BUNDLE_SID",
  "TWILIO_FR_ADDRESS_SID",
  "TWILIO_STATUS_CALLBACK_URL",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID",
] as const;

export function readProvisioningConfig(): { ok: true; config: ProvisioningConfig } | { ok: false; missing: string[] } {
  const env = (key: string) => process.env[key]?.trim() ?? "";
  const missing = REQUIRED_ENV.filter((key) => !env(key));
  if (missing.length) return { ok: false, missing };

  const rawType = env("TWILIO_FR_NUMBER_TYPE") || "local";
  const numberType: NumberType = rawType === "national" || rawType === "mobile" ? rawType : "local";

  return {
    ok: true,
    config: {
      accountSid: env("TWILIO_ACCOUNT_SID"),
      authToken: env("TWILIO_AUTH_TOKEN"),
      bundleSid: env("TWILIO_FR_BUNDLE_SID"),
      addressSid: env("TWILIO_FR_ADDRESS_SID"),
      numberType,
      statusCallbackUrl: env("TWILIO_STATUS_CALLBACK_URL"),
      elevenlabsApiKey: env("ELEVENLABS_API_KEY"),
      elevenlabsAgentId: env("ELEVENLABS_AGENT_ID"),
      elevenlabsBaseUrl: (env("ELEVENLABS_API_BASE_URL") || "https://api.elevenlabs.io").replace(/\/$/, ""),
      elevenlabsTwilioSid: env("TWILIO_API_KEY_SID") || env("TWILIO_ACCOUNT_SID"),
      elevenlabsTwilioToken: env("TWILIO_API_KEY_SECRET") || env("TWILIO_AUTH_TOKEN"),
    },
  };
}

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

async function elevenlabsRequest(
  config: ProvisioningConfig,
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.elevenlabsBaseUrl}${path}`, {
    method,
    headers: { "xi-api-key": config.elevenlabsApiKey, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ElevenLabs ${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/** Import dans ElevenLabs + agent + URL de statut reposée. Renvoie le phone_number_id. */
export async function importIntoElevenLabs(
  config: ProvisioningConfig,
  params: { phoneE164: string; twilioSid: string | null; label: string },
): Promise<string> {
  const created = await elevenlabsRequest(config, "POST", "/v1/convai/phone-numbers", {
    provider: "twilio",
    phone_number: params.phoneE164,
    label: params.label,
    sid: config.elevenlabsTwilioSid,
    token: config.elevenlabsTwilioToken,
  });
  const phoneNumberId = String(created.phone_number_id ?? "").trim();
  if (!phoneNumberId) throw new Error("ElevenLabs n'a pas renvoyé de phone_number_id.");

  await elevenlabsRequest(config, "PATCH", `/v1/convai/phone-numbers/${phoneNumberId}`, {
    agent_id: config.elevenlabsAgentId,
  });

  if (params.twilioSid) {
    const client = twilio(config.accountSid, config.authToken);
    await client.incomingPhoneNumbers(params.twilioSid).update({
      statusCallback: config.statusCallbackUrl,
      statusCallbackMethod: "POST",
    });
  }

  return phoneNumberId;
}

async function provisionOne(
  db: SupabaseClient,
  config: ProvisioningConfig,
  source: "admin_bulk" | "auto_refill",
): Promise<ProvisionResult> {
  const client = twilio(config.accountSid, config.authToken);

  // 1. Achat
  let phoneE164: string;
  let twilioSid: string;
  try {
    const country = client.availablePhoneNumbers("FR");
    const query = { voiceEnabled: true, limit: 5 };
    const candidates =
      config.numberType === "mobile"
        ? await country.mobile.list(query)
        : config.numberType === "national"
          ? await country.national.list(query)
          : await country.local.list(query);
    const candidate = candidates[0]?.phoneNumber;
    if (!candidate) return { ok: false, error: `Aucun numéro FR « ${config.numberType} » disponible chez Twilio.` };

    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: candidate,
      bundleSid: config.bundleSid,
      addressSid: config.addressSid,
      friendlyName: "Soline pool",
      statusCallback: config.statusCallbackUrl,
      statusCallbackMethod: "POST",
    });
    phoneE164 = purchased.phoneNumber;
    twilioSid = purchased.sid;
  } catch (e) {
    return { ok: false, error: `Achat Twilio impossible : ${errorMessage(e)}` };
  }

  // 2-3. ElevenLabs (un échec n'annule pas l'achat)
  let elevenlabsId: string | null = null;
  let warning: string | undefined;
  try {
    elevenlabsId = await importIntoElevenLabs(config, { phoneE164, twilioSid, label: `Soline ${phoneE164}` });
  } catch (e) {
    warning = `Acheté mais non branché sur ElevenLabs : ${errorMessage(e)}`;
    console.error("[voice pool provisioning]", warning);
  }

  // 4. Pool
  const added = await addVoiceNumberToPool(db, {
    phoneE164,
    twilioIncomingPhoneSid: twilioSid,
    elevenlabsReady: !!elevenlabsId,
    notes: warning ?? null,
  });
  if (!added.ok) {
    return { ok: false, error: `Numéro ${phoneE164} acheté (${twilioSid}) mais non ajouté au pool : ${added.error}` };
  }
  await db
    .from("voice_number_pool")
    .update({ elevenlabs_phone_number_id: elevenlabsId, provisioned_by: source })
    .eq("id", added.id);

  return { ok: true, phoneE164, elevenlabsReady: !!elevenlabsId, warning };
}

async function countPool(db: SupabaseClient): Promise<{ available: number; totalActive: number }> {
  const [{ count: available }, { count: totalActive }] = await Promise.all([
    db
      .from("voice_number_pool")
      .select("id", { count: "exact", head: true })
      .eq("status", "available")
      .eq("elevenlabs_ready", true),
    db.from("voice_number_pool").select("id", { count: "exact", head: true }).neq("status", "retired"),
  ]);
  return { available: available ?? 0, totalActive: totalActive ?? 0 };
}

/**
 * Sert les comptes Pro/Premium en attente de numéro (plus anciens d'abord),
 * tant qu'il reste des numéros prêts.
 */
export async function serveWaitingArtisans(db: SupabaseClient, max = 10): Promise<number> {
  const { data: waiting } = await db
    .from("profiles")
    .select("id, subscription_plan, subscription_status")
    .not("voice_number_assignment_pending_at", "is", null)
    .in("subscription_plan", ["pro", "premium"])
    .in("subscription_status", ["active", "trialing", "past_due"])
    .order("voice_number_assignment_pending_at", { ascending: true })
    .limit(max);

  let served = 0;
  for (const profile of waiting ?? []) {
    const sync = await syncSubscriptionVoiceNumber(db, {
      profileId: profile.id as string,
      planId: profile.subscription_plan as SubscriptionPlanId,
      subscriptionStatus: profile.subscription_status as SubscriptionStatus,
    });
    if (sync.poolEmpty) break;
    if (sync.error) console.error("[voice pool] attribution compte en attente", profile.id, sync.error);
    if (sync.assigned) served += 1;
  }
  return served;
}

async function provisionBatch(
  db: SupabaseClient,
  config: ProvisioningConfig,
  count: number,
  source: "admin_bulk" | "auto_refill",
): Promise<{ results: ProvisionResult[]; served: number }> {
  const results: ProvisionResult[] = [];
  for (let i = 0; i < count; i++) {
    const result = await provisionOne(db, config, source);
    results.push(result);
    // Échec d'achat (stock, dossier réglementaire, solde) : inutile d'insister.
    if (!result.ok) break;
  }
  const served = results.some((r) => r.ok && r.elevenlabsReady) ? await serveWaitingArtisans(db) : 0;
  return { results, served };
}

export async function provisionVoiceNumbersForAdmin(
  db: SupabaseClient,
  requested: number,
): Promise<{ ok: true; results: ProvisionResult[]; served: number; capped: boolean } | { ok: false; error: string }> {
  const cfg = readProvisioningConfig();
  if (!cfg.ok) return { ok: false, error: `Configuration incomplète : ${cfg.missing.join(", ")}` };

  const policy = readRefillPolicy();
  const { totalActive } = await countPool(db);
  const count = clampBulkCount(requested, totalActive, policy.maxTotal);
  if (count === 0) {
    return { ok: false, error: `Plafond atteint (${policy.maxTotal} numéros, VOICE_POOL_MAX_TOTAL).` };
  }

  const { results, served } = await provisionBatch(db, cfg.config, count, "admin_bulk");
  return { ok: true, results, served, capped: count < requested };
}

/** Cron : réassort si le stock de numéros prêts passe sous le seuil. Désactivé par défaut. */
export async function refillVoicePoolIfNeeded(
  db: SupabaseClient,
): Promise<{ enabled: boolean; purchased: number; results: ProvisionResult[]; served: number; reason?: string }> {
  if (process.env.VOICE_POOL_AUTO_REFILL?.trim() !== "true") {
    return { enabled: false, purchased: 0, results: [], served: 0, reason: "VOICE_POOL_AUTO_REFILL désactivé" };
  }
  const cfg = readProvisioningConfig();
  if (!cfg.ok) {
    return { enabled: true, purchased: 0, results: [], served: 0, reason: `config incomplète : ${cfg.missing.join(", ")}` };
  }

  const { available, totalActive } = await countPool(db);
  const count = computeRefillCount({ available, totalActive, policy: readRefillPolicy() });
  if (count === 0) return { enabled: true, purchased: 0, results: [], served: 0, reason: "stock suffisant ou plafond atteint" };

  const { results, served } = await provisionBatch(db, cfg.config, count, "auto_refill");
  return { enabled: true, purchased: results.filter((r) => r.ok).length, results, served };
}

/** Réessaie le branchement ElevenLabs d'un numéro du pool acheté mais non prêt. */
export async function retryElevenLabsImport(
  db: SupabaseClient,
  poolId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = readProvisioningConfig();
  if (!cfg.ok) return { ok: false, error: `Configuration incomplète : ${cfg.missing.join(", ")}` };

  const { data: row } = await db
    .from("voice_number_pool")
    .select("id, phone_e164, twilio_incoming_phone_sid, elevenlabs_ready, status")
    .eq("id", poolId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Entrée introuvable." };
  if (row.elevenlabs_ready) return { ok: true };

  try {
    const id = await importIntoElevenLabs(cfg.config, {
      phoneE164: row.phone_e164 as string,
      twilioSid: (row.twilio_incoming_phone_sid as string | null) ?? null,
      label: `Soline ${row.phone_e164}`,
    });
    await db
      .from("voice_number_pool")
      .update({ elevenlabs_ready: true, elevenlabs_phone_number_id: id, notes: null, updated_at: new Date().toISOString() })
      .eq("id", poolId);
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }

  await serveWaitingArtisans(db);
  return { ok: true };
}

export type QuarantineReleaseResult = { phoneE164: string; ok: boolean; error?: string };

/**
 * Fin de quarantaine (30 jours après un désabonnement) : le numéro est retiré d'ElevenLabs,
 * rendu à Twilio (plus de location) et passé en « retired ». Il n'est jamais réattribué à un
 * autre artisan. Une erreur sur un numéro n'arrête pas les autres ; il sera retenté demain.
 */
export async function releaseExpiredQuarantinedNumbers(
  db: SupabaseClient,
  now: Date = new Date(),
  max = 20,
): Promise<{ enabled: boolean; results: QuarantineReleaseResult[]; reason?: string }> {
  const cfg = readProvisioningConfig();
  if (!cfg.ok) return { enabled: false, results: [], reason: `config incomplète : ${cfg.missing.join(", ")}` };
  const config = cfg.config;

  const { data: rows, error } = await db
    .from("voice_number_pool")
    .select("id, phone_e164, twilio_incoming_phone_sid, elevenlabs_phone_number_id")
    .eq("status", "quarantine")
    .lte("quarantine_until", now.toISOString())
    .order("quarantine_until", { ascending: true })
    .limit(max);
  if (error) return { enabled: true, results: [], reason: error.message };

  const client = twilio(config.accountSid, config.authToken);
  const results: QuarantineReleaseResult[] = [];

  for (const row of rows ?? []) {
    const phoneE164 = row.phone_e164 as string;
    try {
      const elevenlabsId = (row.elevenlabs_phone_number_id as string | null) ?? null;
      if (elevenlabsId) {
        await elevenlabsRequest(config, "DELETE", `/v1/convai/phone-numbers/${elevenlabsId}`).catch((e) => {
          // Déjà supprimé côté ElevenLabs : on continue.
          if (!String(e).includes("404")) throw e;
        });
      }

      let twilioSid = (row.twilio_incoming_phone_sid as string | null) ?? null;
      if (!twilioSid) {
        const found = await client.incomingPhoneNumbers.list({ phoneNumber: phoneE164, limit: 1 });
        twilioSid = found[0]?.sid ?? null;
      }
      if (twilioSid) {
        await client.incomingPhoneNumbers(twilioSid).remove();
      }

      await db
        .from("voice_number_pool")
        .update({
          status: "retired",
          released_to_carrier_at: now.toISOString(),
          notes: "Rendu à Twilio en fin de quarantaine",
          updated_at: now.toISOString(),
        })
        .eq("id", row.id);
      results.push({ phoneE164, ok: true });
    } catch (e) {
      const message = errorMessage(e);
      console.error("[voice pool] restitution fin de quarantaine", phoneE164, message);
      results.push({ phoneE164, ok: false, error: message });
    }
  }

  return { enabled: true, results };
}
