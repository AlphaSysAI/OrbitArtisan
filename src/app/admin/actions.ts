"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { getAdminTenant, getPlanVoiceMinutes, type ArtisanSubscriptionStatus } from "@/lib/admin/tenants";
import { requirePlatformAdminSafe } from "@/lib/auth/platform-admin";
import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getAdminDb } from "@/lib/admin/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SubscriptionStatus } from "@/lib/billing/subscription-access";
import {
  clearVoiceNumberAssignmentPending,
  syncSubscriptionVoiceNumber,
} from "@/lib/voice/subscription-voice-number-sync";
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

export async function updateTenantProfile(
  profileId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();

  const businessName = String(formData.get("business_name") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const siret = String(formData.get("siret") ?? "").trim() || null;
  const siren = String(formData.get("siren") ?? "").trim() || null;

  if (!businessName) return { ok: false, error: "missing_business_name" };

  const tenant = await getAdminTenant(profileId);
  if (!tenant) return { ok: false, error: "not_found" };

  const { error } = await sbAdmin
    .from("profiles")
    .update({
      business_name: businessName,
      name,
      phone,
      siret,
      siren,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (error) return { ok: false, error: "update_failed" };

  await writeAdminAuditLog({
    adminUserId: adminUser.id,
    action: "tenant.update",
    targetUserId: tenant.userId,
    targetProfileId: profileId,
    details: { businessName, name, siret, siren },
  });

  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${profileId}`);
  return { ok: true };
}

export async function updateTenantPlan(
  profileId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();

  const plan = String(formData.get("subscription_plan") ?? "") as SubscriptionPlanId;
  const status = String(formData.get("subscription_status") ?? "") as ArtisanSubscriptionStatus;

  if (!["base", "pro", "premium"].includes(plan)) return { ok: false, error: "invalid_plan" };
  if (!["active", "past_due", "canceled", "trialing"].includes(status)) {
    return { ok: false, error: "invalid_status" };
  }

  const tenant = await getAdminTenant(profileId);
  if (!tenant) return { ok: false, error: "not_found" };

  const updatePayload: Record<string, unknown> = {
    subscription_plan: plan,
    subscription_status: status,
    voice_minutes_included: getPlanVoiceMinutes(plan),
    updated_at: new Date().toISOString(),
  };

  if (status === "active") {
    updatePayload.trial_ends_at = null;
  } else if (status === "trialing") {
    updatePayload.trial_ends_at = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
  }

  const { error } = await sbAdmin.from("profiles").update(updatePayload).eq("id", profileId);

  if (error) return { ok: false, error: "update_failed" };

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
    details: { plan, status },
  });

  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${profileId}`);
  revalidatePath("/app/reglages");
  return { ok: true };
}

export async function suspendTenant(profileId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();
  const tenant = await getAdminTenant(profileId);
  if (!tenant) return { ok: false, error: "not_found" };

  const { error } = await sbAdmin
    .from("profiles")
    .update({ account_status: "suspended", updated_at: new Date().toISOString() })
    .eq("id", profileId);

  if (error) return { ok: false, error: "update_failed" };

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
  if (!tenant) return { ok: false, error: "not_found" };

  const { error } = await sbAdmin
    .from("profiles")
    .update({
      account_status: "active",
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (error) return { ok: false, error: "update_failed" };

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

export async function archiveTenant(profileId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();
  const tenant = await getAdminTenant(profileId);
  if (!tenant) return { ok: false, error: "not_found" };

  const { error } = await sbAdmin
    .from("profiles")
    .update({
      deleted_at: new Date().toISOString(),
      account_status: "suspended",
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (error) return { ok: false, error: "update_failed" };

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
  return { ok: true };
}

export async function resetTenantAccess(profileId: string): Promise<{ ok: true; url?: string } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();
  const tenant = await getAdminTenant(profileId);
  if (!tenant?.email) return { ok: false, error: "no_email" };

  const { data, error } = await sbAdmin.auth.admin.generateLink({
    type: "recovery",
    email: tenant.email,
    options: { redirectTo: `${getPublicSiteUrl()}/login` },
  });

  if (error || !data.properties?.action_link) return { ok: false, error: "link_failed" };

  await writeAdminAuditLog({
    adminUserId: adminUser.id,
    action: "tenant.reset_access",
    targetUserId: tenant.userId,
    targetProfileId: profileId,
  });

  return { ok: true, url: data.properties.action_link };
}

export async function updateTenantProfileForm(profileId: string, formData: FormData) {
  await updateTenantProfile(profileId, formData);
}

export async function updateTenantPlanForm(profileId: string, formData: FormData) {
  await updateTenantPlan(profileId, formData);
}

export async function updateTenantVoiceNumber(
  profileId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user: adminUser, admin: sbAdmin } = await guardAdmin();
  const tenant = await getAdminTenant(profileId);
  if (!tenant) return { ok: false, error: "not_found" };

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
  if (!tenant) return { ok: false, error: "not_found" };

  const result = await syncSubscriptionVoiceNumber(sbAdmin, {
    profileId,
    planId: tenant.subscriptionPlan,
    subscriptionStatus: tenant.subscriptionStatus as SubscriptionStatus,
  });

  if (result.error) return { ok: false, error: result.error };
  if (result.poolEmpty) return { ok: false, error: "pool_empty" };

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

export async function updateTenantVoiceNumberForm(profileId: string, formData: FormData) {
  await updateTenantVoiceNumber(profileId, formData);
}

export async function listAdminAuditLogs(page = 1, pageSize = 30) {
  const res = await requirePlatformAdminSafe();
  if (!res.ok) {
    return { items: [], total: 0, page, pageSize };
  }

  const admin = getAdminDb();
  if (!admin) {
    return { items: [], total: 0, page, pageSize };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count } = await admin
    .from("admin_audit_logs")
    .select("id, admin_user_id, target_user_id, target_profile_id, action, details, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to);

  return { items: data ?? [], total: count ?? 0, page, pageSize };
}
