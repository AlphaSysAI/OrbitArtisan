import "server-only";

import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { getPlanVoiceMinutes } from "@/lib/billing/subscription-plans";
import {
  emptyAdminMetrics,
  getAdminDb,
  isMissingColumnError,
  type AdminSetupIssue,
} from "@/lib/admin/db";

export type ArtisanAccountStatus = "active" | "suspended";
export type ArtisanSubscriptionStatus = "active" | "past_due" | "canceled" | "trialing";

export type AdminTenantRow = {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  businessName: string;
  siret: string | null;
  siren: string | null;
  slug: string;
  subscriptionPlan: SubscriptionPlanId;
  subscriptionStatus: ArtisanSubscriptionStatus;
  accountStatus: ArtisanAccountStatus;
  createdAt: string;
  deletedAt: string | null;
  quotesCount: number;
  invoicesCount: number;
};

export type AdminPlatformMetrics = {
  artisansTotal: number;
  artisansActive: number;
  artisansSuspended: number;
  quotesTotal: number;
  invoicesTotal: number;
  customersTotal: number;
  estimatedMrrCents: number;
};

const PLAN_MRR_CENTS: Record<SubscriptionPlanId, number> = {
  base: 3900,
  pro: 6900,
  premium: 9900,
};

const PROFILE_EXTENDED_SELECT =
  "id, user_id, name, business_name, siret, siren, slug, subscription_plan, subscription_status, account_status, created_at, deleted_at";

const PROFILE_LEGACY_SELECT =
  "id, user_id, name, business_name, siret, siren, slug, created_at";

export async function fetchAdminPlatformMetrics(): Promise<{
  metrics: AdminPlatformMetrics;
  issue?: AdminSetupIssue;
}> {
  const admin = getAdminDb();
  if (!admin) return { metrics: emptyAdminMetrics(), issue: "missing_service_role" };

  const { count: quotesTotal } = await admin.from("quotes").select("id", { count: "exact", head: true });
  const { count: invoicesTotal } = await admin.from("invoices").select("id", { count: "exact", head: true });
  const { count: customersTotal } = await admin
    .from("customer_profiles")
    .select("id", { count: "exact", head: true });

  let artisansTotal = 0;
  let artisansSuspended = 0;
  let estimatedMrrCents = 0;
  let migrationIssue = false;

  const totalRes = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  if (isMissingColumnError(totalRes.error)) {
    migrationIssue = true;
    const legacyTotal = await admin.from("profiles").select("id", { count: "exact", head: true });
    artisansTotal = legacyTotal.count ?? 0;
  } else {
    artisansTotal = totalRes.count ?? 0;

    const suspendedRes = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("account_status", "suspended");
    if (!isMissingColumnError(suspendedRes.error)) {
      artisansSuspended = suspendedRes.count ?? 0;
    }

    const planRes = await admin
      .from("profiles")
      .select("subscription_plan")
      .is("deleted_at", null)
      .eq("account_status", "active")
      .eq("subscription_status", "active");

    if (isMissingColumnError(planRes.error)) {
      const legacyPlans = await admin.from("profiles").select("subscription_plan");
      if (isMissingColumnError(legacyPlans.error)) {
        migrationIssue = true;
      } else {
        for (const row of legacyPlans.data ?? []) {
          const plan = (row.subscription_plan as SubscriptionPlanId) ?? "base";
          estimatedMrrCents += PLAN_MRR_CENTS[plan] ?? PLAN_MRR_CENTS.base;
        }
      }
    } else {
      for (const row of planRes.data ?? []) {
        const plan = (row.subscription_plan as SubscriptionPlanId) ?? "base";
        estimatedMrrCents += PLAN_MRR_CENTS[plan] ?? PLAN_MRR_CENTS.base;
      }
    }
  }

  if (migrationIssue && artisansTotal === 0) {
    return { metrics: emptyAdminMetrics(), issue: "missing_migration" };
  }

  return {
    metrics: {
      artisansTotal,
      artisansActive: artisansTotal - artisansSuspended,
      artisansSuspended,
      quotesTotal: quotesTotal ?? 0,
      invoicesTotal: invoicesTotal ?? 0,
      customersTotal: customersTotal ?? 0,
      estimatedMrrCents,
    },
    issue: migrationIssue ? "missing_migration" : undefined,
  };
}

type ListTenantsParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  accountStatus?: ArtisanAccountStatus | "all";
  subscriptionPlan?: SubscriptionPlanId | "all";
  includeArchived?: boolean;
};

export async function listAdminTenants(params: ListTenantsParams = {}): Promise<{
  items: AdminTenantRow[];
  total: number;
  page: number;
  pageSize: number;
  issue?: AdminSetupIssue;
}> {
  const admin = getAdminDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(10, params.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  if (!admin) {
    return { items: [], total: 0, page, pageSize, issue: "missing_service_role" };
  }

  let useLegacy = false;
  let query = admin.from("profiles").select(PROFILE_EXTENDED_SELECT, { count: "exact" }).order("created_at", {
    ascending: false,
  });

  if (!params.includeArchived) {
    query = query.is("deleted_at", null);
  }
  if (params.accountStatus && params.accountStatus !== "all") {
    query = query.eq("account_status", params.accountStatus);
  }
  if (params.subscriptionPlan && params.subscriptionPlan !== "all") {
    query = query.eq("subscription_plan", params.subscriptionPlan);
  }

  const q = params.q?.trim();
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(
      `business_name.ilike.${pattern},name.ilike.${pattern},siret.ilike.${pattern},siren.ilike.${pattern},slug.ilike.${pattern}`,
    );
  }

  let { data: profiles, count, error } = await query.range(from, to);

  if (isMissingColumnError(error)) {
    useLegacy = true;
    let legacyQuery = admin.from("profiles").select(PROFILE_LEGACY_SELECT, { count: "exact" }).order("created_at", {
      ascending: false,
    });
    if (q) {
      const pattern = `%${q.replace(/[%_]/g, "")}%`;
      legacyQuery = legacyQuery.or(
        `business_name.ilike.${pattern},name.ilike.${pattern},siret.ilike.${pattern},siren.ilike.${pattern},slug.ilike.${pattern}`,
      );
    }
    const legacyRes = await legacyQuery.range(from, to);
    profiles = legacyRes.data as typeof profiles;
    count = legacyRes.count;
    error = legacyRes.error;
  }

  if (error) {
    return { items: [], total: 0, page, pageSize, issue: "missing_migration" };
  }

  if (!profiles?.length) {
    return {
      items: [],
      total: count ?? 0,
      page,
      pageSize,
      issue: useLegacy ? "missing_migration" : undefined,
    };
  }

  const profileIds = profiles.map((p) => p.id as string);
  const userIds = profiles.map((p) => p.user_id as string);

  const emailByUserId = new Map<string, string | null>();
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const { data } = await admin.auth.admin.getUserById(uid);
        emailByUserId.set(uid, data.user?.email ?? null);
      } catch {
        emailByUserId.set(uid, null);
      }
    }),
  );

  if (q) {
    const qLower = q.toLowerCase();
    const filtered = profiles.filter((p) => {
      const email = emailByUserId.get(p.user_id as string)?.toLowerCase() ?? "";
      return (
        String(p.business_name ?? "").toLowerCase().includes(qLower) ||
        String(p.name ?? "").toLowerCase().includes(qLower) ||
        String(p.siret ?? "").includes(q) ||
        String(p.siren ?? "").includes(q) ||
        email.includes(qLower)
      );
    });
    if (filtered.length !== profiles.length) {
      profiles.splice(0, profiles.length, ...filtered);
    }
  }

  const { data: quoteCounts } = await admin.from("quotes").select("artisan_id").in("artisan_id", profileIds);
  const { data: invoiceCounts } = await admin.from("invoices").select("artisan_id").in("artisan_id", profileIds);

  const quotesByArtisan = new Map<string, number>();
  for (const row of quoteCounts ?? []) {
    const id = row.artisan_id as string;
    quotesByArtisan.set(id, (quotesByArtisan.get(id) ?? 0) + 1);
  }

  const invoicesByArtisan = new Map<string, number>();
  for (const row of invoiceCounts ?? []) {
    const id = row.artisan_id as string;
    invoicesByArtisan.set(id, (invoicesByArtisan.get(id) ?? 0) + 1);
  }

  const items: AdminTenantRow[] = profiles.map((p) => ({
    id: p.id as string,
    userId: p.user_id as string,
    email: emailByUserId.get(p.user_id as string) ?? null,
    name: (p.name as string | null) ?? null,
    businessName: p.business_name as string,
    siret: (p.siret as string | null) ?? null,
    siren: (p.siren as string | null) ?? null,
    slug: p.slug as string,
    subscriptionPlan: ((p as { subscription_plan?: string }).subscription_plan as SubscriptionPlanId) ?? "base",
    subscriptionStatus:
      ((p as { subscription_status?: string }).subscription_status as ArtisanSubscriptionStatus) ?? "active",
    accountStatus: ((p as { account_status?: string }).account_status as ArtisanAccountStatus) ?? "active",
    createdAt: p.created_at as string,
    deletedAt: ((p as { deleted_at?: string | null }).deleted_at as string | null) ?? null,
    quotesCount: quotesByArtisan.get(p.id as string) ?? 0,
    invoicesCount: invoicesByArtisan.get(p.id as string) ?? 0,
  }));

  return {
    items,
    total: count ?? items.length,
    page,
    pageSize,
    issue: useLegacy ? "missing_migration" : undefined,
  };
}

export async function getAdminTenant(profileId: string): Promise<AdminTenantRow | null> {
  const admin = getAdminDb();
  if (!admin) return null;

  let p: Record<string, unknown> | null = null;
  let profileError = null;

  const extended = await admin.from("profiles").select(PROFILE_EXTENDED_SELECT).eq("id", profileId).maybeSingle();
  p = extended.data;
  profileError = extended.error;

  if (isMissingColumnError(profileError)) {
    const legacy = await admin.from("profiles").select(PROFILE_LEGACY_SELECT).eq("id", profileId).maybeSingle();
    p = legacy.data;
    profileError = legacy.error;
  }

  if (profileError || !p) return null;

  let email: string | null = null;
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(p.user_id as string);
    email = authUser.user?.email ?? null;
  } catch {
    email = null;
  }

  const profileIdValue = p.id as string;

  const [{ count: quotesCount }, { count: invoicesCount }] = await Promise.all([
    admin.from("quotes").select("id", { count: "exact", head: true }).eq("artisan_id", profileIdValue),
    admin.from("invoices").select("id", { count: "exact", head: true }).eq("artisan_id", profileIdValue),
  ]);

  return {
    id: profileIdValue,
    userId: p.user_id as string,
    email,
    name: (p.name as string | null) ?? null,
    businessName: p.business_name as string,
    siret: (p.siret as string | null) ?? null,
    siren: (p.siren as string | null) ?? null,
    slug: p.slug as string,
    subscriptionPlan: (p.subscription_plan as SubscriptionPlanId | undefined) ?? "base",
    subscriptionStatus: (p.subscription_status as ArtisanSubscriptionStatus | undefined) ?? "active",
    accountStatus: (p.account_status as ArtisanAccountStatus | undefined) ?? "active",
    createdAt: p.created_at as string,
    deletedAt: (p.deleted_at as string | null | undefined) ?? null,
    quotesCount: quotesCount ?? 0,
    invoicesCount: invoicesCount ?? 0,
  };
}

export { getPlanVoiceMinutes };
