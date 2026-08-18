import "server-only";

import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { getPlanVoiceMinutes } from "@/lib/billing/subscription-plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

export async function fetchAdminPlatformMetrics(): Promise<AdminPlatformMetrics> {
  const admin = createSupabaseAdminClient();

  const { count: artisansTotal } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  const { count: artisansSuspended } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("account_status", "suspended");

  const { count: quotesTotal } = await admin.from("quotes").select("id", { count: "exact", head: true });
  const { count: invoicesTotal } = await admin.from("invoices").select("id", { count: "exact", head: true });
  const { count: customersTotal } = await admin
    .from("customer_profiles")
    .select("id", { count: "exact", head: true });

  const { data: planRows } = await admin
    .from("profiles")
    .select("subscription_plan")
    .is("deleted_at", null)
    .eq("account_status", "active")
    .eq("subscription_status", "active");

  let estimatedMrrCents = 0;
  for (const row of planRows ?? []) {
    const plan = (row.subscription_plan as SubscriptionPlanId) ?? "base";
    estimatedMrrCents += PLAN_MRR_CENTS[plan] ?? PLAN_MRR_CENTS.base;
  }

  const total = artisansTotal ?? 0;
  const suspended = artisansSuspended ?? 0;

  return {
    artisansTotal: total,
    artisansActive: total - suspended,
    artisansSuspended: suspended,
    quotesTotal: quotesTotal ?? 0,
    invoicesTotal: invoicesTotal ?? 0,
    customersTotal: customersTotal ?? 0,
    estimatedMrrCents,
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
}> {
  const admin = createSupabaseAdminClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(10, params.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from("profiles")
    .select(
      "id, user_id, name, business_name, siret, siren, slug, subscription_plan, subscription_status, account_status, created_at, deleted_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

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

  const { data: profiles, count, error } = await query.range(from, to);
  if (error || !profiles?.length) {
    return { items: [], total: count ?? 0, page, pageSize };
  }

  const profileIds = profiles.map((p) => p.id as string);
  const userIds = profiles.map((p) => p.user_id as string);

  const emailByUserId = new Map<string, string | null>();
  await Promise.all(
    userIds.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid);
      emailByUserId.set(uid, data.user?.email ?? null);
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
      // Requête email côté serveur : filtre complémentaire en mémoire sur la page courante.
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
    subscriptionPlan: (p.subscription_plan as SubscriptionPlanId) ?? "base",
    subscriptionStatus: (p.subscription_status as ArtisanSubscriptionStatus) ?? "active",
    accountStatus: (p.account_status as ArtisanAccountStatus) ?? "active",
    createdAt: p.created_at as string,
    deletedAt: (p.deleted_at as string | null) ?? null,
    quotesCount: quotesByArtisan.get(p.id as string) ?? 0,
    invoicesCount: invoicesByArtisan.get(p.id as string) ?? 0,
  }));

  return { items, total: count ?? items.length, page, pageSize };
}

export async function getAdminTenant(profileId: string): Promise<AdminTenantRow | null> {
  const admin = createSupabaseAdminClient();
  const { data: p } = await admin
    .from("profiles")
    .select(
      "id, user_id, name, business_name, siret, siren, slug, subscription_plan, subscription_status, account_status, created_at, deleted_at",
    )
    .eq("id", profileId)
    .maybeSingle();
  if (!p) return null;

  const { data: authUser } = await admin.auth.admin.getUserById(p.user_id as string);

  const [{ count: quotesCount }, { count: invoicesCount }] = await Promise.all([
    admin.from("quotes").select("id", { count: "exact", head: true }).eq("artisan_id", profileId),
    admin.from("invoices").select("id", { count: "exact", head: true }).eq("artisan_id", profileId),
  ]);

  return {
    id: p.id as string,
    userId: p.user_id as string,
    email: authUser.user?.email ?? null,
    name: (p.name as string | null) ?? null,
    businessName: p.business_name as string,
    siret: (p.siret as string | null) ?? null,
    siren: (p.siren as string | null) ?? null,
    slug: p.slug as string,
    subscriptionPlan: (p.subscription_plan as SubscriptionPlanId) ?? "base",
    subscriptionStatus: (p.subscription_status as ArtisanSubscriptionStatus) ?? "active",
    accountStatus: (p.account_status as ArtisanAccountStatus) ?? "active",
    createdAt: p.created_at as string,
    deletedAt: (p.deleted_at as string | null) ?? null,
    quotesCount: quotesCount ?? 0,
    invoicesCount: invoicesCount ?? 0,
  };
}

export { getPlanVoiceMinutes };
