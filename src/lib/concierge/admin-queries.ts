import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnonymizedLeadSummary } from "@/lib/concierge/summary";
import { ilikeOrPattern } from "@/lib/security/postgrest-filter";

export type ProspectStatus = "new" | "contacted" | "converted" | "blacklisted";

export type ProspectRow = {
  id: string;
  business_name: string;
  trade: string;
  trade_category: string;
  phone: string;
  email: string | null;
  city: string | null;
  postal_code: string | null;
  latitude: number | null;
  status: ProspectStatus;
  notes: string | null;
  opt_out: boolean;
  source: string | null;
  last_contacted_at: string | null;
  contact_count: number;
  converted_profile_id: string | null;
  created_at: string;
};

type AlertRow = {
  id: string;
  lead_id: string;
  registered_count: number;
  prospect_ids: string[];
  summary: AnonymizedLeadSummary;
  status: "open" | "handled" | "dismissed";
  handled_at: string | null;
  created_at: string;
};

const PROSPECT_COLUMNS =
  "id, business_name, trade, trade_category, phone, email, city, postal_code, latitude, status, notes, opt_out, source, last_contacted_at, contact_count, converted_profile_id, created_at";

export const PROSPECT_PAGE_SIZE = 50;

export async function listAlerts(db: SupabaseClient, input: { onlyOpen: boolean }) {
  let q = db
    .from("concierge_alerts")
    .select("id, lead_id, registered_count, prospect_ids, summary, status, handled_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (input.onlyOpen) q = q.eq("status", "open");
  const { data: alerts } = await q;
  const rows = (alerts ?? []) as AlertRow[];

  const ids = [...new Set(rows.flatMap((a) => a.prospect_ids))];
  const prospects = new Map<string, ProspectRow>();
  if (ids.length) {
    const { data } = await db.from("prospect_artisans").select(PROSPECT_COLUMNS).in("id", ids);
    for (const p of (data ?? []) as ProspectRow[]) prospects.set(p.id, p);
  }
  return rows.map((a) => ({
    ...a,
    // Un prospect désinscrit depuis l'alerte disparaît de l'affichage (RGPD).
    prospects: a.prospect_ids.map((id) => prospects.get(id)).filter((p): p is ProspectRow => !!p && !p.opt_out),
  }));
}

export async function listProspects(
  db: SupabaseClient,
  input: { status: ProspectStatus | "all"; q: string; page: number },
) {
  const from = (Math.max(1, input.page) - 1) * PROSPECT_PAGE_SIZE;
  let query = db
    .from("prospect_artisans")
    .select(PROSPECT_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PROSPECT_PAGE_SIZE - 1);
  if (input.status !== "all") query = query.eq("status", input.status);
  const q = input.q.trim();
  if (/^\d{2,5}$/.test(q)) query = query.like("postal_code", `${q}%`);
  else if (q) {
    const pattern = ilikeOrPattern(q);
    query = query.or(`business_name.ilike.${pattern},city.ilike.${pattern},trade.ilike.${pattern}`);
  }
  const { data, count } = await query;
  return { rows: (data ?? []) as ProspectRow[], total: count ?? 0 };
}

export async function getProspect(db: SupabaseClient, id: string) {
  const { data } = await db.from("prospect_artisans").select(PROSPECT_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return null;
  const [{ data: alerts }, { data: invites }] = await Promise.all([
    db
      .from("concierge_alerts")
      .select("id, lead_id, registered_count, prospect_ids, summary, status, handled_at, created_at")
      .contains("prospect_ids", [id])
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("concierge_invites")
      .select("token, lead_id, sms_sent_at, claimed_at, expires_at, created_at")
      .eq("prospect_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  return {
    prospect: data as ProspectRow,
    alerts: (alerts ?? []) as AlertRow[],
    invites: (invites ?? []) as { token: string; lead_id: string | null; sms_sent_at: string | null; claimed_at: string | null; expires_at: string; created_at: string }[],
  };
}
