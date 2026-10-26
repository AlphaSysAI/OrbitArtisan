"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { getAdminTenant, type ArtisanSubscriptionStatus } from "@/lib/admin/tenants";
import { requirePlatformAdminSafe } from "@/lib/auth/platform-admin";
import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getAdminDb } from "@/lib/admin/db";
import { computeTrialEndsAt, type SubscriptionStatus } from "@/lib/billing/subscription-access";
import {
  planIncludesSolineVoice,
  subscriptionStatusKeepsVoiceNumber,
  clearVoiceNumberAssignmentPending,
  syncSubscriptionVoiceNumber,
} from "@/lib/voice/subscription-voice-number-sync";
import { normalizeCustomerPhone } from "@/lib/phone";
import { normalizePoolPhoneE164 } from "@/lib/voice/voice-number-pool";
import { syncArtisanVoiceNumberMapping } from "@/lib/voice/voice-number-registry";

async function guardAdmin() {
  const res = await requirePlatformAdminSafe();
  if (!res.ok) {
    if (res.error === "auth") redirect("/login?next=/admin");
    redirect("/admin/forbidden");
  }
  const admin = getAdminDb();
  if (!admin) {
    throw new Error("ADMIN_MISSING_SERVICE_ROLE");
  }
  return { user: res.user, admin };
}

const PROFILE_ERRORS: Record<string, string> = {
  missing_business_name: "La raison sociale est obligatoire.",
  invalid_phone: "Téléphone invalide (ex. 06 12 34 56 78).",
  invalid_siren: "SIREN invalide (9 chiffres).",
  invalid_siret: "SIRET invalide (14 chiffres).",
  not_found: "Compte introuvable.",
  update_failed: "Enregistrement impossible.",
};

export async function updateTenantProfileAction(
  profileId: string,
  input: Record<string, string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();
  const fail = (code: string) => ({ ok: false as const, error: PROFILE_ERRORS[code] ?? code });

  const businessName = String(input.business_name ?? "").trim();
  const name = String(input.name ?? "").trim() || null;
  const phoneRaw = String(input.phone ?? "").trim();
  const phone = phoneRaw ? normalizeCustomerPhone(phoneRaw) : null;
  const siret = String(input.siret ?? "").replace(/\s/g, "") || null;
  const siren = String(input.siren ?? "").replace(/\s/g, "") || null;

  if (!businessName) return fail("missing_business_name");
  if (phoneRaw && !phone) return fail("invalid_phone");
  if (siren && !/^\d{9}$/.test(siren)) return fail("invalid_siren");
  if (siret && !/^\d{14}$/.test(siret)) return fail("invalid_siret");

  const tenant = await getAdminTenant(profileId);
  if (!tenant) return fail("not_found");

  const { error } = await sbAdmin
    .from("profiles")
    .update({ business_name: businessName, name, phone, siret, siren, updated_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) return fail("update_failed");

  await writeAdminAuditLog({
    adminUserId: adminUser.id,
    action: "tenant.update",
    targetUserId: tenant.userId,
    targetProfileId: profileId,
    details: { businessName, name, phone, siret, siren },
  });

  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${profileId}`);
  return { ok: true };
}

/**
 * Correction manuelle de l'état d'abonnement en base. Ne modifie PAS Stripe : la
 * facturation réelle se change dans Stripe (le webhook remet ensuite la base à jour).
 */
export async function updateTenantPlanAction(
  profileId: string,
  input: { plan: string; status: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();

  const plan = input.plan as SubscriptionPlanId;
  const status = input.status as ArtisanSubscriptionStatus;

  if (!["base", "pro", "premium"].includes(plan)) return { ok: false, error: "Formule invalide." };
  if (!["incomplete", "active", "past_due", "canceled", "trialing"].includes(status)) {
    return { ok: false, error: "Statut invalide." };
  }

  const tenant = await getAdminTenant(profileId);
  if (!tenant) return { ok: false, error: "Compte introuvable." };

  const updatePayload: Record<string, unknown> = {
    subscription_plan: plan,
    subscription_status: status,
    updated_at: new Date().toISOString(),
  };

  if (status === "active") {
    updatePayload.trial_ends_at = null;
  } else if (status === "trialing") {
    updatePayload.trial_ends_at = computeTrialEndsAt();
  }

  const { error } = await sbAdmin.from("profiles").update(updatePayload).eq("id", profileId);

  if (error) return { ok: false, error: "Enregistrement impossible." };

  await syncSubscriptionVoiceNumber(sbAdmin, {
    profileId,
    planId: plan,
    subscriptionStatus: status as SubscriptionStatus,
  });

  await writeAdminAuditLog({
    adminUserId: adminUser.id,
    action: "tenant.plan_change",
    targetUserId: tenant.userId,
    targetProfileId: profileId,
    details: { plan, status, previous: { plan: tenant.subscriptionPlan, status: tenant.subscriptionStatus } },
  });

  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${profileId}`);
  revalidatePath("/app/reglages");
  return { ok: true };
}

export async function suspendTenant(profileId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();
  const tenant = await getAdminTenant(profileId);
  if (!tenant) return { ok: false, error: "Compte introuvable." };

  const { error } = await sbAdmin
    .from("profiles")
    .update({ account_status: "suspended", updated_at: new Date().toISOString() })
    .eq("id", profileId);

  if (error) return { ok: false, error: "Enregistrement impossible." };

  await writeAdminAuditLog({
    adminUserId: adminUser.id,
    action: "tenant.suspend",
    targetUserId: tenant.userId,
    targetProfileId: profileId,
  });

  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${profileId}`);
  return { ok: true };
}

export async function reactivateTenant(profileId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();
  const tenant = await getAdminTenant(profileId);
  if (!tenant) return { ok: false, error: "Compte introuvable." };

  const { error } = await sbAdmin
    .from("profiles")
    .update({ account_status: "active", updated_at: new Date().toISOString() })
    .eq("id", profileId);

  if (error) return { ok: false, error: "Enregistrement impossible." };

  await writeAdminAuditLog({
    adminUserId: adminUser.id,
    action: "tenant.reactivate",
    targetUserId: tenant.userId,
    targetProfileId: profileId,
  });

  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${profileId}`);
  return { ok: true };
}

/** Annule un archivage : le compte redevient visible et actif (le numéro Soline n'est pas rendu). */
export async function restoreTenant(profileId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();
  const tenant = await getAdminTenant(profileId);
  if (!tenant) return { ok: false, error: "Compte introuvable." };
  const { error } = await sbAdmin
    .from("profiles")
    .update({ deleted_at: null, account_status: "active", updated_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) return { ok: false, error: "Restauration impossible." };
  await writeAdminAuditLog({ adminUserId: adminUser.id, action: "tenant.restore", targetUserId: tenant.userId, targetProfileId: profileId });
  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${profileId}`);
  return { ok: true };
}

export async function archiveTenant(profileId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();
  const tenant = await getAdminTenant(profileId);
  if (!tenant) return { ok: false, error: "Compte introuvable." };

  const { error } = await sbAdmin
    .from("profiles")
    .update({
      deleted_at: new Date().toISOString(),
      account_status: "suspended",
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (error) return { ok: false, error: "Enregistrement impossible." };

  await syncArtisanVoiceNumberMapping({
    supabase: sbAdmin,
    artisanId: profileId,
    phoneE164: null,
    assignedBy: "platform_admin",
    releaseReasonWhenCleared: "account_archived",
  });

  await writeAdminAuditLog({
    adminUserId: adminUser.id,
    action: "tenant.archive",
    targetUserId: tenant.userId,
    targetProfileId: profileId,
  });

  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${profileId}`);
  return { ok: true };
}

export async function resetTenantAccess(profileId: string): Promise<{ ok: true; url?: string } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();
  const tenant = await getAdminTenant(profileId);
  if (!tenant?.email) return { ok: false, error: "Aucun e-mail sur ce compte." };

  const { data, error } = await sbAdmin.auth.admin.generateLink({
    type: "recovery",
    email: tenant.email,
    options: { redirectTo: `${getPublicSiteUrl()}/login` },
  });

  if (error || !data.properties?.action_link) return { ok: false, error: "Lien impossible à générer." };

  await writeAdminAuditLog({
    adminUserId: adminUser.id,
    action: "tenant.reset_access",
    targetUserId: tenant.userId,
    targetProfileId: profileId,
  });

  return { ok: true, url: data.properties.action_link };
}

export async function updateTenantVoiceNumber(
  profileId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();
  const tenant = await getAdminTenant(profileId);
  if (!tenant) return { ok: false, error: "Compte introuvable." };

  const raw = String(formData.get("voice_phone_e164") ?? "").trim();
  const phoneE164 = raw ? normalizePoolPhoneE164(raw) : null;
  if (raw && !phoneE164) return { ok: false, error: "invalid_phone" };

  await sbAdmin.rpc("release_voice_number_from_pool", {
    p_artisan_id: profileId,
    p_phone_e164: null,
  });

  if (phoneE164) {
    await sbAdmin
      .from("voice_number_pool")
      .update({
        status: "assigned",
        assigned_artisan_id: profileId,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("phone_e164", phoneE164)
      .eq("status", "available");
  }

  const sync = await syncArtisanVoiceNumberMapping({
    supabase: sbAdmin,
    artisanId: profileId,
    phoneE164,
    assignedBy: "platform_admin",
    releaseReasonWhenCleared: "admin_removed",
  });

  if (!sync.ok) {
    const msg = sync.error === "phone_already_assigned" ? "Numéro déjà rattaché à un autre artisan." : sync.error;
    return { ok: false, error: msg };
  }

  if (phoneE164) {
    await clearVoiceNumberAssignmentPending(sbAdmin, profileId);
  }

  await writeAdminAuditLog({
    adminUserId: adminUser.id,
    action: "tenant.voice_number",
    targetUserId: tenant.userId,
    targetProfileId: profileId,
    details: { phoneE164 },
  });

  revalidatePath(`/admin/tenants/${profileId}`);
  revalidatePath("/app/reglages");
  return { ok: true };
}

export async function assignTenantVoiceFromPool(
  profileId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();
  const tenant = await getAdminTenant(profileId);
  if (!tenant) return { ok: false, error: "Compte introuvable." };

  // Sans ces garde-fous, la synchro "libère" au lieu d'attribuer et l'action
  // revient ok sans rien faire (échec silencieux côté admin).
  if (!planIncludesSolineVoice(tenant.subscriptionPlan)) {
    return { ok: false, error: "plan_without_voice" };
  }
  if (!subscriptionStatusKeepsVoiceNumber(tenant.subscriptionStatus as SubscriptionStatus)) {
    return { ok: false, error: "subscription_inactive" };
  }

  const result = await syncSubscriptionVoiceNumber(sbAdmin, {
    profileId,
    planId: tenant.subscriptionPlan,
    subscriptionStatus: tenant.subscriptionStatus as SubscriptionStatus,
    // Décision admin explicite : attribue même un essai sans carte.
    force: true,
  });

  if (result.error) return { ok: false, error: result.error };
  // Aucun numéro libre : achat Twilio lancé en arrière-plan (after).
  if (result.poolEmpty) return { ok: false, error: result.provisioningScheduled ? "provisioning_started" : "pool_empty" };

  await writeAdminAuditLog({
    adminUserId: adminUser.id,
    action: "tenant.voice_pool_assign",
    targetUserId: tenant.userId,
    targetProfileId: profileId,
  });

  revalidatePath(`/admin/tenants/${profileId}`);
  revalidatePath("/app/reglages");
  return { ok: true };
}

export async function listAdminAuditLogs(page = 1, pageSize = 30, category: string | null = null) {
  const res = await requirePlatformAdminSafe();
  if (!res.ok) return { items: [], total: 0, page, pageSize };
  const admin = getAdminDb();
  if (!admin) return { items: [], total: 0, page, pageSize };

  const from = (page - 1) * pageSize;
  let query = admin
    .from("admin_audit_logs")
    .select("id, admin_user_id, target_user_id, target_profile_id, action, details, created_at", { count: "exact" })
    .order("created_at", { ascending: false });
  if (category && /^[a-z_]+$/.test(category)) query = query.like("action", `${category}.%`);
  const { data, count } = await query.range(from, from + pageSize - 1);
  return { items: data ?? [], total: count ?? 0, page, pageSize };
}
