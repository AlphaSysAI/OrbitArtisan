import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import twilio from "twilio";

import type { SubscriptionStatus } from "@/lib/billing/subscription-access";
import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { syncSubscriptionVoiceNumber } from "@/lib/voice/subscription-voice-number-sync";
import { addVoiceNumberToPool } from "@/lib/voice/voice-number-pool";
import { emailButton, escapeHtml } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send-email";
import { getPublicSiteUrl } from "@/lib/site-url";
import { clampBulkCount, readRefillPolicy, shouldAlertPoolCapacity } from "@/lib/voice/voice-pool-refill";

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

type ProvisioningConfig = {
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
async function importIntoElevenLabs(
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

/** Préfixes ARCEP par type : 01-05 géographiques, 09 non géographiques, 06-07 mobiles. */
const NUMBER_TYPE_PREFIX: Record<NumberType, RegExp> = {
  local: /^\+33[1-5]\d{8}$/,
  national: /^\+339\d{8}$/,
  mobile: /^\+33[67]\d{8}$/,
};
const MAX_PURCHASE_ATTEMPTS = 5;

async function provisionOne(
  db: SupabaseClient,
  config: ProvisioningConfig,
  source: "admin_bulk" | "on_demand",
): Promise<ProvisionResult> {
  const client = twilio(config.accountSid, config.authToken);

  // 1. Achat. L'inventaire Twilio « local » FR mélange parfois des numéros d'un autre
  // type réglementaire que celui du dossier (erreur « correct regulation type ») :
  // on filtre sur le préfixe du type attendu et on passe au candidat suivant si besoin.
  let phoneE164 = "";
  let twilioSid = "";
  try {
    const country = client.availablePhoneNumbers("FR");
    const query = { voiceEnabled: true, limit: 20 };
    const listed =
      config.numberType === "mobile"
        ? await country.mobile.list(query)
        : config.numberType === "national"
          ? await country.national.list(query)
          : await country.local.list(query);
    const candidates = listed.map((c) => c.phoneNumber).filter((n) => NUMBER_TYPE_PREFIX[config.numberType].test(n));
    if (!candidates.length) return { ok: false, error: `Aucun numéro FR « ${config.numberType} » disponible chez Twilio.` };

    let lastError = "";
    for (const candidate of candidates.slice(0, MAX_PURCHASE_ATTEMPTS)) {
      try {
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
        break;
      } catch (e) {
        lastError = errorMessage(e);
        // Seules les incompatibilités propres au numéro justifient d'essayer le suivant.
        if (!/regulation type|address|not available/i.test(lastError)) throw e;
        console.warn("[voice pool provisioning] candidat ignoré", candidate, lastError);
      }
    }
    if (!twilioSid) return { ok: false, error: `Achat Twilio impossible (${MAX_PURCHASE_ATTEMPTS} numéros essayés) : ${lastError}` };
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

/** Abonnés Pro/Premium sans numéro ; un essai n'est éligible qu'avec une CB (abonnement Stripe). */
function waitingArtisansQuery(db: SupabaseClient, columns: string, head = false) {
  return db
    .from("profiles")
    .select(columns, head ? { count: "exact", head: true } : undefined)
    .not("voice_number_assignment_pending_at", "is", null)
    .in("subscription_plan", ["pro", "premium"])
    .in("subscription_status", ["active", "trialing", "past_due"])
    .or("subscription_status.neq.trialing,stripe_subscription_id.not.is.null");
}

async function countPool(db: SupabaseClient): Promise<{ available: number; totalActive: number; waiting: number }> {
  const [{ count: available }, { count: totalActive }, { count: waiting }] = await Promise.all([
    db
      .from("voice_number_pool")
      .select("id", { count: "exact", head: true })
      .eq("status", "available")
      .eq("elevenlabs_ready", true),
    db.from("voice_number_pool").select("id", { count: "exact", head: true }).neq("status", "retired"),
    waitingArtisansQuery(db, "id", true),
  ]);
  return { available: available ?? 0, totalActive: totalActive ?? 0, waiting: waiting ?? 0 };
}

/**
 * Sert les comptes Pro/Premium en attente de numéro (plus anciens d'abord),
 * tant qu'il reste des numéros prêts.
 */
export async function serveWaitingArtisans(db: SupabaseClient, max = 50): Promise<number> {
  const { data } = await waitingArtisansQuery(db, "id, subscription_plan, subscription_status")
    .order("voice_number_assignment_pending_at", { ascending: true })
    .limit(max);
  const waiting = (data ?? []) as unknown as { id: string; subscription_plan: string; subscription_status: string }[];

  let served = 0;
  for (const profile of waiting) {
    const sync = await syncSubscriptionVoiceNumber(db, {
      profileId: profile.id,
      planId: profile.subscription_plan as SubscriptionPlanId,
      subscriptionStatus: profile.subscription_status as SubscriptionStatus,
      // Ici on distribue le stock existant : jamais d'achat en cascade.
      provisionIfMissing: false,
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
  source: "admin_bulk",
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

const PROVISIONING_LOCK_MS = 10 * 60_000;

type ArtisanProvisionResult =
  | { ok: true; phoneE164: string | null; skipped?: "locked_or_not_waiting" | "already_served" }
  | { ok: false; error: string };

/**
 * Achat à la demande pour UN artisan en attente : Twilio → ElevenLabs → attribution.
 * Verrou atomique par artisan (profiles.voice_number_provisioning_at) : les événements
 * Stripe multiples ou le cron concurrent ne provoquent jamais 2 achats.
 * Échec : l'artisan reste en attente, e-mail admin, nouvelle tentative au cron.
 */
export async function provisionNumberForArtisan(db: SupabaseClient, profileId: string): Promise<ArtisanProvisionResult> {
  const staleBefore = new Date(Date.now() - PROVISIONING_LOCK_MS).toISOString();
  const { data: locked } = await db
    .from("profiles")
    .update({ voice_number_provisioning_at: new Date().toISOString() })
    .eq("id", profileId)
    .not("voice_number_assignment_pending_at", "is", null)
    .or(`voice_number_provisioning_at.is.null,voice_number_provisioning_at.lt."${staleBefore}"`)
    .select("id, subscription_plan, subscription_status")
    .maybeSingle();
  if (!locked) return { ok: true, phoneE164: null, skipped: "locked_or_not_waiting" };

  const planId = locked.subscription_plan as SubscriptionPlanId;
  const subscriptionStatus = locked.subscription_status as SubscriptionStatus;
  const fail = async (error: string): Promise<ArtisanProvisionResult> => {
    console.error("[voice pool] achat à la demande", profileId, error);
    await alertAdmin(`🚨 Numéro Soline non attribué`, [
      `Un abonné Pro/Premium attend son numéro (profil ${profileId}).`,
      error,
      "Nouvelle tentative automatique au prochain passage du cron (6 h 30 UTC), ou achat manuel depuis le pool.",
    ]);
    return { ok: false, error };
  };

  try {
    // Un numéro a pu se libérer entre-temps (réparation manuelle, quarantaine) : pas d'achat.
    const first = await syncSubscriptionVoiceNumber(db, { profileId, planId, subscriptionStatus, force: true, provisionIfMissing: false });
    if (first.assigned) return { ok: true, phoneE164: null, skipped: "already_served" };
    if (!first.poolEmpty) return { ok: true, phoneE164: null, skipped: "already_served" };

    const cfg = readProvisioningConfig();
    if (!cfg.ok) return await fail(`Configuration incomplète : ${cfg.missing.join(", ")}`);

    const { maxTotal } = readRefillPolicy();
    const { totalActive } = await countPool(db);
    if (totalActive >= maxTotal) {
      return await fail(`Plafond atteint : ${totalActive}/${maxTotal} numéros (VOICE_POOL_MAX_TOTAL). Relevez-le dans Vercel puis redéployez.`);
    }

    const bought = await provisionOne(db, cfg.config, "on_demand");
    if (!bought.ok) return await fail(bought.error);
    if (!bought.elevenlabsReady) {
      return await fail(`${bought.phoneE164} acheté mais non branché sur ElevenLabs : « Réessayer ElevenLabs » dans le pool l'attribuera. ${bought.warning ?? ""}`);
    }

    const sync = await syncSubscriptionVoiceNumber(db, { profileId, planId, subscriptionStatus, force: true, provisionIfMissing: false });
    if (!sync.assigned) return await fail(sync.error ?? `${bought.phoneE164} acheté mais non attribué (reste libre dans le pool).`);
    return { ok: true, phoneE164: bought.phoneE164 };
  } finally {
    await db.from("profiles").update({ voice_number_provisioning_at: null }).eq("id", profileId);
  }
}

/**
 * Cron (filet de sécurité) : relance les achats des abonnés restés en attente
 * (échec Twilio/ElevenLabs, plafond relevé…). S'arrête au premier échec.
 */
export async function provisionForWaitingArtisans(
  db: SupabaseClient,
  budgetMs = 90_000,
): Promise<{ attempted: number; served: number; error?: string }> {
  const started = Date.now();
  const { data } = await waitingArtisansQuery(db, "id")
    .order("voice_number_assignment_pending_at", { ascending: true })
    .limit(30);
  const waiting = (data ?? []) as unknown as { id: string }[];

  let attempted = 0;
  let served = 0;
  for (const { id } of waiting) {
    if (Date.now() - started > budgetMs) break;
    attempted += 1;
    const res = await provisionNumberForArtisan(db, id);
    if (!res.ok) return { attempted, served, error: res.error };
    if (res.phoneE164 || res.skipped === "already_served") served += 1;
  }
  return { attempted, served };
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

type QuarantineReleaseResult = { phoneE164: string; ok: boolean; error?: string };

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

function adminAlertRecipients(): string[] {
  return (process.env.ADMIN_ALERT_EMAIL ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

async function alertAdmin(subject: string, lines: string[]): Promise<void> {
  const to = adminAlertRecipients();
  if (!to.length) return;
  const url = `${getPublicSiteUrl()}/admin/telecom/pool`;
  await Promise.all(
    to.map((addr) =>
      sendEmail({
        to: addr,
        subject,
        html: `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}${emailButton(url, "Ouvrir le pool")}`,
        text: `${lines.join("\n")}\n${url}`,
      }).catch(() => undefined),
    ),
  );
}

/**
 * E-mail admin (ADMIN_ALERT_EMAIL) quand le registre atteint 80 % de VOICE_POOL_MAX_TOTAL.
 * Sans état : envoyé uniquement lors du passage de 6 h UTC, donc 1 rappel par jour
 * maximum, même si le cron devient horaire (Vercel Pro).
 */
export async function alertPoolCapacityIfNeeded(db: SupabaseClient, now = new Date()): Promise<boolean> {
  if (now.getUTCHours() !== 6) return false;
  if (!adminAlertRecipients().length) return false;

  const { maxTotal } = readRefillPolicy();
  const { totalActive, waiting } = await countPool(db);
  if (!shouldAlertPoolCapacity(totalActive, maxTotal)) return false;

  const pct = maxTotal > 0 ? Math.round((totalActive / maxTotal) * 100) : 100;
  const blocked = totalActive >= maxTotal && waiting > 0;
  await alertAdmin(
    blocked
      ? `🚨 Plafond numéros atteint : ${waiting} abonné${waiting > 1 ? "s" : ""} sans numéro`
      : `⚠️ Numéros Soline à ${pct} % du plafond (${totalActive}/${maxTotal})`,
    [
      `Numéros détenus (attribués + quarantaine + libres) : ${totalActive} / ${maxTotal} (${pct} %)`,
      `Abonnés en attente de numéro : ${waiting}`,
      "Action : augmenter VOICE_POOL_MAX_TOTAL dans Vercel (Settings → Environment Variables), puis redéployer.",
    ],
  );
  return true;
}
