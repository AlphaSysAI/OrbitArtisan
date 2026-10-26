import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAdminDb, type AdminSetupIssue } from "@/lib/admin/db";
import { computeDashboardMetrics, type DashboardMetrics, type DashboardProfileRow } from "@/lib/admin/dashboard-metrics";
import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { ilikeOrPattern } from "@/lib/security/postgrest-filter";
import { isMissingSchemaObject } from "@/lib/supabase/schema-compat";

export type ArtisanAccountStatus = "active" | "suspended";
export type ArtisanSubscriptionStatus = "incomplete" | "active" | "past_due" | "canceled" | "trialing";

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
  trialEndsAt: string | null;
  onboardingCompletedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  quotesCount: number;
  invoicesCount: number;
};

const TENANT_SELECT =
  "id, user_id, name, business_name, siret, siren, slug, subscription_plan, subscription_status, account_status, trial_ends_at, onboarding_completed_at, created_at, deleted_at";

// --- E-mails (auth.users) ------------------------------------------------------------------

/** E-mails des comptes en une requête (RPC migration 65), repli ligne à ligne sinon. */
export async function fetchUserEmails(admin: SupabaseClient, userIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (!userIds.length) return out;
  const { data, error } = await admin.rpc("admin_user_emails", { p_user_ids: userIds });
  if (!error) {
    for (const row of (data ?? []) as { user_id: string; email: string | null }[]) out.set(row.user_id, row.email);
    return out;
  }
  if (!isMissingSchemaObject(error, "admin_user_emails")) console.error("[admin] e-mails", error.code, error.message);
  await Promise.all(
    userIds.map(async (uid) => {
      const { data: u } = await admin.auth.admin.getUserById(uid).catch(() => ({ data: { user: null } }));
      out.set(uid, u.user?.email ?? null);
    }),
  );
  return out;
}

async function searchUserIdsByEmail(admin: SupabaseClient, q: string): Promise<string[]> {
  if (q.trim().length < 3) return [];
  const { data, error } = await admin.rpc("admin_search_user_ids_by_email", { p_query: q });
  if (error) {
    if (!isMissingSchemaObject(error, "admin_search_user_ids_by_email")) console.error("[admin] recherche e-mail", error.code, error.message);
    // Avant la migration 65 : correspondance exacte seulement.
    const { data: exact } = await admin.rpc("lookup_auth_user_id_by_email", { p_email: q.trim() });
    return exact ? [exact as string] : [];
  }
  return ((data ?? []) as string[]).filter(Boolean);
}

// --- Accueil -----------------------------------------------------------------------------

export type AdminDashboard = {
  metrics: DashboardMetrics;
  openConciergeAlerts: number;
  readyVoiceNumbers: number;
  voiceNumbersNotReady: number;
  expiredReferrerInvitations: number;
  customersTotal: number;
  activeReferrers: number;
  issue?: AdminSetupIssue;
};

const EMPTY_METRICS = computeDashboardMetrics([]);

export async function fetchAdminDashboard(now = new Date()): Promise<AdminDashboard> {
  const empty: AdminDashboard = {
    metrics: EMPTY_METRICS,
    openConciergeAlerts: 0,
    readyVoiceNumbers: 0,
    voiceNumbersNotReady: 0,
    expiredReferrerInvitations: 0,
    customersTotal: 0,
    activeReferrers: 0,
  };
  const admin = getAdminDb();
  if (!admin) return { ...empty, issue: "missing_service_role" };

  const count = (q: PromiseLike<{ count: number | null; error: unknown }>) =>
    Promise.resolve(q).then((r) => (r.error ? 0 : (r.count ?? 0)));

  const [profilesRes, events, alerts, ready, notReady, expiredInv, customers, referrers] = await Promise.all([
    admin
      .from("profiles")
      .select("id, subscription_plan, subscription_status, account_status, trial_ends_at, created_at, onboarding_completed_at, voice_number_assignment_pending_at")
      .is("deleted_at", null)
      .limit(10_000),
    admin
      .from("stripe_billing_events")
      .select("profile_id, billing_interval, created_at")
      .not("billing_interval", "is", null)
      .order("created_at", { ascending: false })
      .limit(10_000),
    count(admin.from("concierge_alerts").select("id", { count: "exact", head: true }).eq("status", "open")),
    count(admin.from("voice_number_pool").select("id", { count: "exact", head: true }).eq("status", "available").eq("elevenlabs_ready", true)),
    count(admin.from("voice_number_pool").select("id", { count: "exact", head: true }).eq("status", "available").eq("elevenlabs_ready", false)),
    count(
      admin
        .from("business_referrer_invitations")
        .select("id", { count: "exact", head: true })
        .is("claimed_at", null)
        .is("cancelled_at", null)
        .lt("expires_at", now.toISOString()),
    ),
    count(admin.from("customer_profiles").select("id", { count: "exact", head: true })),
    count(admin.from("business_referrers").select("id", { count: "exact", head: true }).eq("status", "active")),
  ]);

  if (profilesRes.error) {
    console.error("[admin] accueil", profilesRes.error.code, profilesRes.error.message);
    return { ...empty, issue: "missing_migration" };
  }

  // Dernière périodicité payée connue par artisan (la plus récente gagne).
  const intervalByProfile = new Map<string, "monthly" | "annual">();
  for (const e of (events.data ?? []) as { profile_id: string | null; billing_interval: string | null }[]) {
    if (!e.profile_id || intervalByProfile.has(e.profile_id)) continue;
    if (e.billing_interval === "monthly" || e.billing_interval === "annual") intervalByProfile.set(e.profile_id, e.billing_interval);
  }

  const rows: DashboardProfileRow[] = ((profilesRes.data ?? []) as (DashboardProfileRow & { id: string })[]).map((p) => ({
    ...p,
    billing_interval: intervalByProfile.get(p.id) ?? null,
  }));

  return {
    metrics: computeDashboardMetrics(rows, now),
    openConciergeAlerts: alerts,
    readyVoiceNumbers: ready,
    voiceNumbersNotReady: notReady,
    expiredReferrerInvitations: expiredInv,
    customersTotal: customers,
    activeReferrers: referrers,
  };
}

// --- Liste --------------------------------------------------------------------------------

export const TENANT_VIEWS = [
  { id: "all", label: "Tous" },
  { id: "active", label: "Abonnés" },
  { id: "trialing", label: "En essai" },
  { id: "trial_ending", label: "Fin d'essai < 7 j" },
  { id: "past_due", label: "Impayés" },
  { id: "incomplete", label: "Sans formule" },
  { id: "voice_pending", label: "Numéro en attente" },
  { id: "canceled", label: "Résiliés" },
  { id: "suspended", label: "Suspendus" },
  { id: "archived", label: "Archivés" },
] as const;

export type TenantView = (typeof TENANT_VIEWS)[number]["id"];

export function parseTenantView(raw: unknown): TenantView {
  return TENANT_VIEWS.some((v) => v.id === raw) ? (raw as TenantView) : "all";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyView(query: any, view: TenantView, now: Date) {
  if (view === "archived") return query.not("deleted_at", "is", null);
  query = query.is("deleted_at", null);
  switch (view) {
    case "suspended":
      return query.eq("account_status", "suspended");
    case "active":
    case "trialing":
    case "past_due":
    case "incomplete":
    case "canceled":
      return query.eq("subscription_status", view).eq("account_status", "active");
    case "trial_ending":
      return query
        .eq("subscription_status", "trialing")
        .eq("account_status", "active")
        .gte("trial_ends_at", now.toISOString())
        .lte("trial_ends_at", new Date(now.getTime() + 7 * 86_400_000).toISOString());
    case "voice_pending":
      return query.not("voice_number_assignment_pending_at", "is", null).eq("account_status", "active");
    default:
      return query;
  }
}

function toRow(p: Record<string, unknown>, email: string | null, quotes: number, invoices: number): AdminTenantRow {
  return {
    id: p.id as string,
    userId: p.user_id as string,
    email,
    name: (p.name as string | null) ?? null,
    businessName: (p.business_name as string | null) ?? "",
    siret: (p.siret as string | null) ?? null,
    siren: (p.siren as string | null) ?? null,
    slug: p.slug as string,
    subscriptionPlan: ((p.subscription_plan as SubscriptionPlanId | null) ?? "base") as SubscriptionPlanId,
    subscriptionStatus: ((p.subscription_status as ArtisanSubscriptionStatus | null) ?? "incomplete") as ArtisanSubscriptionStatus,
    accountStatus: ((p.account_status as ArtisanAccountStatus | null) ?? "active") as ArtisanAccountStatus,
    trialEndsAt: (p.trial_ends_at as string | null) ?? null,
    onboardingCompletedAt: (p.onboarding_completed_at as string | null) ?? null,
    createdAt: p.created_at as string,
    deletedAt: (p.deleted_at as string | null) ?? null,
    quotesCount: quotes,
    invoicesCount: invoices,
  };
}

export async function listAdminTenants(params: { page?: number; q?: string; view?: TenantView } = {}, now = new Date()): Promise<{
  items: AdminTenantRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: Partial<Record<TenantView, number>>;
  issue?: AdminSetupIssue;
}> {
  const admin = getAdminDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = 25;
  const view = params.view ?? "all";
  if (!admin) return { items: [], total: 0, page, pageSize, counts: {}, issue: "missing_service_role" };

  const q = params.q?.trim() ?? "";
  const emailUserIds = q ? await searchUserIdsByEmail(admin, q) : [];
  const searchFilter = q
    ? [
        ...["business_name", "name", "siret", "siren", "slug"].map((c) => `${c}.ilike.${ilikeOrPattern(q)}`),
        ...(emailUserIds.length ? [`user_id.in.(${emailUserIds.join(",")})`] : []),
      ].join(",")
    : null;

  let query = admin.from("profiles").select(TENANT_SELECT, { count: "exact" }).order("created_at", { ascending: false });
  query = applyView(query, view, now);
  if (searchFilter) query = query.or(searchFilter);
  const { data, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);

  // Compteurs des onglets (sans la recherche) : une requête légère par onglet.
  const countEntries = await Promise.all(
    TENANT_VIEWS.map(async (v) => {
      const res = await applyView(admin.from("profiles").select("id", { count: "exact", head: true }), v.id, now);
      return [v.id, res.error ? null : (res.count ?? 0)] as const;
    }),
  );
  const counts = Object.fromEntries(countEntries.filter(([, c]) => c !== null)) as Partial<Record<TenantView, number>>;

  if (error) {
    console.error("[admin] liste artisans", error.code, error.message);
    return { items: [], total: 0, page, pageSize, counts, issue: "missing_migration" };
  }
  const profiles = (data ?? []) as Record<string, unknown>[];
  if (!profiles.length) return { items: [], total: count ?? 0, page, pageSize, counts };

  const ids = profiles.map((p) => p.id as string);
  const [emails, quoteRows, invoiceRows] = await Promise.all([
    fetchUserEmails(admin, profiles.map((p) => p.user_id as string)),
    admin.from("quotes").select("artisan_id").in("artisan_id", ids),
    admin.from("invoices").select("artisan_id").in("artisan_id", ids),
  ]);
  const tally = (rows: { artisan_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.artisan_id, (m.get(r.artisan_id) ?? 0) + 1);
    return m;
  };
  const quotes = tally(quoteRows.data as { artisan_id: string }[] | null);
  const invoices = tally(invoiceRows.data as { artisan_id: string }[] | null);

  return {
    items: profiles.map((p) =>
      toRow(p, emails.get(p.user_id as string) ?? null, quotes.get(p.id as string) ?? 0, invoices.get(p.id as string) ?? 0),
    ),
    total: count ?? profiles.length,
    page,
    pageSize,
    counts,
  };
}

// --- Fiche --------------------------------------------------------------------------------

export async function getAdminTenant(profileId: string): Promise<AdminTenantRow | null> {
  const admin = getAdminDb();
  if (!admin) return null;
  const { data: p, error } = await admin.from("profiles").select(TENANT_SELECT).eq("id", profileId).maybeSingle();
  if (error || !p) return null;
  const [emails, { count: quotesCount }, { count: invoicesCount }] = await Promise.all([
    fetchUserEmails(admin, [p.user_id as string]),
    admin.from("quotes").select("id", { count: "exact", head: true }).eq("artisan_id", profileId),
    admin.from("invoices").select("id", { count: "exact", head: true }).eq("artisan_id", profileId),
  ]);
  return toRow(p as Record<string, unknown>, emails.get(p.user_id as string) ?? null, quotesCount ?? 0, invoicesCount ?? 0);
}

export type AdminTenantDetail = AdminTenantRow & {
  phone: string | null;
  address: string | null;
  trade: string | null;
  tradeCategory: string | null;
  vatRegime: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  voiceNumberPendingAt: string | null;
  history: { id: string; action: string; created_at: string; details: Record<string, unknown> | null }[];
};

export async function getAdminTenantDetail(profileId: string): Promise<AdminTenantDetail | null> {
  const base = await getAdminTenant(profileId);
  const admin = getAdminDb();
  if (!base || !admin) return null;
  const [{ data: extra }, { data: history }] = await Promise.all([
    admin
      .from("profiles")
      .select("phone, address_line1, postal_code, city, trade, trade_category, vat_regime, stripe_customer_id, stripe_subscription_id, voice_number_assignment_pending_at")
      .eq("id", profileId)
      .maybeSingle(),
    admin
      .from("admin_audit_logs")
      .select("id, action, created_at, details")
      .eq("target_profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  const e = (extra ?? {}) as Record<string, string | null>;
  return {
    ...base,
    phone: e.phone ?? null,
    address: [e.address_line1, [e.postal_code, e.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
    trade: e.trade ?? null,
    tradeCategory: e.trade_category ?? null,
    vatRegime: e.vat_regime ?? null,
    stripeCustomerId: e.stripe_customer_id ?? null,
    stripeSubscriptionId: e.stripe_subscription_id ?? null,
    voiceNumberPendingAt: e.voice_number_assignment_pending_at ?? null,
    history: (history ?? []) as AdminTenantDetail["history"],
  };
}
