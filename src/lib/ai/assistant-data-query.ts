import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatDateListFr } from "@/lib/ai/extract-dates";
import { formatIsoDateFr } from "@/lib/ai/resolve-date";

export type AppointmentLite = {
  id: string;
  start_time: string;
  status: string;
  customer_name: string;
  service_title?: string | null;
};

function dayKey(isoOrTs: string): string {
  // start_time is timestamptz ISO → local date key via Date
  const d = new Date(isoOrTs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function statusLabel(status: string): string {
  if (status === "pending") return "en attente";
  if (status === "confirmed") return "confirmé";
  if (status === "cancelled") return "annulé";
  return status;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Charge les RDV de l’artisan sur les jours demandés (hors annulés par défaut).
 */
export async function fetchAppointmentsForDates(
  supabase: SupabaseClient,
  artisanId: string,
  dateIsos: string[],
  opts?: { includeCancelled?: boolean },
): Promise<AppointmentLite[]> {
  if (!dateIsos.length) return [];

  const sorted = [...dateIsos].sort();
  const start = `${sorted[0]}T00:00:00`;
  const endDay = sorted[sorted.length - 1];
  // Fin exclusive : lendemain du dernier jour
  const endDate = new Date(`${endDay}T12:00:00`);
  endDate.setDate(endDate.getDate() + 1);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}T00:00:00`;

  const { data, error } = await supabase
    .from("appointments")
    .select("id, start_time, status, customer_name, service_id")
    .eq("artisan_id", artisanId)
    .gte("start_time", start)
    .lt("start_time", end)
    .order("start_time", { ascending: true });

  if (error) {
    console.error("[assistant-query] appointments", error);
    return [];
  }

  const wanted = new Set(dateIsos);
  let rows = (data ?? []).filter((r) => wanted.has(dayKey(r.start_time)));
  if (!opts?.includeCancelled) {
    rows = rows.filter((r) => r.status !== "cancelled");
  }

  const serviceIds = [...new Set(rows.map((r) => r.service_id).filter(Boolean))] as string[];
  const titleById = new Map<string, string>();
  if (serviceIds.length) {
    const { data: services } = await supabase.from("services").select("id, title").in("id", serviceIds);
    for (const s of services ?? []) titleById.set(s.id, s.title);
  }

  return rows.map((r) => ({
    id: r.id,
    start_time: r.start_time,
    status: r.status,
    customer_name: r.customer_name,
    service_title: r.service_id ? titleById.get(r.service_id) ?? null : null,
  }));
}

export function buildAppointmentsAnswer(dateIsos: string[], rows: AppointmentLite[]): {
  reply: string;
  href: string | null;
} {
  const label = formatDateListFr(dateIsos);
  const byDay = new Map<string, AppointmentLite[]>();
  for (const iso of dateIsos) byDay.set(iso, []);
  for (const row of rows) {
    const key = dayKey(row.start_time);
    const list = byDay.get(key);
    if (list) list.push(row);
  }

  const emptyDays = dateIsos.filter((d) => (byDay.get(d) ?? []).length === 0);
  const busyDays = dateIsos.filter((d) => (byDay.get(d) ?? []).length > 0);

  if (!rows.length) {
    return {
      reply:
        dateIsos.length === 1
          ? `Non — tu n’as aucun rendez-vous le ${label}.`
          : `Non — tu n’as aucun rendez-vous les ${label}.`,
      href: dateIsos[0] ? `/app/rdv?date=${dateIsos[0]}` : "/app/rdv",
    };
  }

  const lines: string[] = [];
  if (dateIsos.length === 1) {
    lines.push(`Oui — ${rows.length} rendez-vous le ${label} :`);
  } else {
    lines.push(
      `Voici ce que j’ai trouvé (${rows.length} RDV sur ${busyDays.length} jour${busyDays.length > 1 ? "s" : ""}) :`,
    );
  }

  for (const iso of dateIsos) {
    const dayRows = byDay.get(iso) ?? [];
    if (!dayRows.length) {
      lines.push(`• ${formatIsoDateFr(iso)} : aucun RDV`);
      continue;
    }
    if (dateIsos.length > 1) lines.push(`• ${formatIsoDateFr(iso)} :`);
    for (const r of dayRows) {
      const svc = r.service_title ? ` — ${r.service_title}` : "";
      lines.push(
        `  – ${formatTime(r.start_time)} · ${r.customer_name}${svc} (${statusLabel(r.status)})`,
      );
    }
  }

  if (emptyDays.length && busyDays.length) {
    lines.push(`Pas de RDV : ${emptyDays.map(formatIsoDateFr).join(", ")}.`);
  }

  const firstBusy = busyDays[0] ?? dateIsos[0];
  return {
    reply: lines.join("\n"),
    href: firstBusy ? `/app/rdv?date=${firstBusy}` : "/app/rdv",
  };
}

export async function countPendingQuotes(supabase: SupabaseClient, artisanId: string): Promise<number> {
  const { count } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("artisan_id", artisanId)
    .eq("status", "sent");
  return count ?? 0;
}

export async function countPendingInvoices(supabase: SupabaseClient, artisanId: string): Promise<number> {
  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("artisan_id", artisanId)
    .eq("status", "sent");
  return count ?? 0;
}
