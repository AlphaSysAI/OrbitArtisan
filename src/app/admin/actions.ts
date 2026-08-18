"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { getAdminTenant, getPlanVoiceMinutes, type ArtisanSubscriptionStatus } from "@/lib/admin/tenants";
import {
  ADMIN_IMPERSONATION_COOKIE,
  ADMIN_RETURN_SESSION_COOKIE,
  type AdminReturnSessionCookie,
  type ImpersonationCookie,
} from "@/lib/auth/impersonation";
import { requirePlatformAdminSafe } from "@/lib/auth/platform-admin";
import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { getPublicSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function guardAdmin() {
  const res = await requirePlatformAdminSafe();
  if (!res.ok) {
    if (res.error === "auth") redirect("/login?next=/admin");
    redirect("/admin/forbidden");
  }
  return res.user;
}

export async function updateTenantProfile(
  profileId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const adminUser = await guardAdmin();
  const sbAdmin = createSupabaseAdminClient();

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
  const adminUser = await guardAdmin();
  const sbAdmin = createSupabaseAdminClient();

  const plan = String(formData.get("subscription_plan") ?? "") as SubscriptionPlanId;
  const status = String(formData.get("subscription_status") ?? "") as ArtisanSubscriptionStatus;

  if (!["base", "pro", "premium"].includes(plan)) return { ok: false, error: "invalid_plan" };
  if (!["active", "past_due", "canceled", "trialing"].includes(status)) {
    return { ok: false, error: "invalid_status" };
  }

  const tenant = await getAdminTenant(profileId);
  if (!tenant) return { ok: false, error: "not_found" };

  const { error } = await sbAdmin
    .from("profiles")
    .update({
      subscription_plan: plan,
      subscription_status: status,
      voice_minutes_included: getPlanVoiceMinutes(plan),
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (error) return { ok: false, error: "update_failed" };

  await writeAdminAuditLog({
    adminUserId: adminUser.id,
    action: "tenant.plan_change",
    targetUserId: tenant.userId,
    targetProfileId: profileId,
    details: { plan, status },
  });

  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${profileId}`);
  return { ok: true };
}

export async function suspendTenant(profileId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const adminUser = await guardAdmin();
  const sbAdmin = createSupabaseAdminClient();
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
  const adminUser = await guardAdmin();
  const sbAdmin = createSupabaseAdminClient();
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
  const adminUser = await guardAdmin();
  const sbAdmin = createSupabaseAdminClient();
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
  const adminUser = await guardAdmin();
  const sbAdmin = createSupabaseAdminClient();
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

export async function startImpersonation(
  profileId: string,
  readOnly = false,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const adminUser = await guardAdmin();
  const tenant = await getAdminTenant(profileId);
  if (!tenant?.email) return { ok: false, error: "no_email" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: "auth" };

  const sbAdmin = createSupabaseAdminClient();
  const { data, error } = await sbAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: tenant.email,
    options: { redirectTo: `${getPublicSiteUrl()}/app?impersonation=1` },
  });

  if (error || !data.properties?.action_link) return { ok: false, error: "link_failed" };

  const cookieStore = await cookies();
  const returnPayload: AdminReturnSessionCookie = {
    adminUserId: adminUser.id,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
  cookieStore.set(ADMIN_RETURN_SESSION_COOKIE, JSON.stringify(returnPayload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });

  const impersonationPayload: ImpersonationCookie = {
    targetUserId: tenant.userId,
    targetProfileId: profileId,
    targetLabel: tenant.businessName,
    readOnly,
  };
  cookieStore.set(ADMIN_IMPERSONATION_COOKIE, JSON.stringify(impersonationPayload), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });

  await writeAdminAuditLog({
    adminUserId: adminUser.id,
    action: "impersonation.start",
    targetUserId: tenant.userId,
    targetProfileId: profileId,
    details: { readOnly },
  });

  return { ok: true, url: data.properties.action_link };
}

export async function endImpersonation(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_RETURN_SESSION_COOKIE)?.value;

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AdminReturnSessionCookie;
      const supabase = await createSupabaseServerClient();
      await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });

      await writeAdminAuditLog({
        adminUserId: parsed.adminUserId,
        action: "impersonation.end",
      });
    } catch {
      // ignore
    }
  }

  cookieStore.delete(ADMIN_RETURN_SESSION_COOKIE);
  cookieStore.delete(ADMIN_IMPERSONATION_COOKIE);

  redirect("/admin/tenants");
}

export async function updateTenantProfileForm(profileId: string, formData: FormData) {
  await updateTenantProfile(profileId, formData);
}

export async function updateTenantPlanForm(profileId: string, formData: FormData) {
  await updateTenantPlan(profileId, formData);
}

export async function listAdminAuditLogs(page = 1, pageSize = 30) {
  await guardAdmin();
  const admin = createSupabaseAdminClient();
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
