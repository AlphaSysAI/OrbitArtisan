import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadArtisanInvoicesForList,
  loadInvoiceForEditPage,
  loadInvoicesForQuote,
} from "@/lib/billing/load-invoice-for-page";

/**
 * Tests de caractérisation (point 5, refacto latence) : figent la sortie des
 * chargeurs de factures AVANT de réduire le nombre de requêtes, pour garantir
 * que les champs BTP (retenue de garantie), e-invoicing et recouvrement
 * restent strictement identiques — schéma complet ou migrations manquantes.
 */

type Row = Record<string, unknown>;
type Filter = { col: string; op: "eq" | "in"; value: unknown };

const MISSING_COLUMN_ERROR = { code: "42703", message: 'column "x" does not exist' };

function fakeSupabase(opts: { invoices: Row[]; missingColumns?: string[]; failingColumns?: string[] }) {
  const calls: string[] = [];
  const missing = new Set(opts.missingColumns ?? []);
  const failing = new Set(opts.failingColumns ?? []);

  function builder(table: string) {
    let columns: string[] = [];
    const filters: Filter[] = [];
    let orderCol: string | null = null;

    const exec = (single: boolean) => {
      calls.push(`${table}:${columns.join(",")}`);
      if (columns.some((c) => missing.has(c))) return { data: null, error: MISSING_COLUMN_ERROR };
      if (columns.some((c) => failing.has(c))) return { data: null, error: { code: "57014", message: "timeout" } };
      let rows = opts.invoices.filter((r) =>
        filters.every((f) => (f.op === "eq" ? r[f.col] === f.value : (f.value as unknown[]).includes(r[f.col]))),
      );
      if (orderCol) {
        const key = orderCol;
        rows = [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
      }
      const projected = rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null])));
      return { data: single ? (projected[0] ?? null) : projected, error: null };
    };

    const b = {
      select(sel: string) {
        columns = sel.split(",").map((s) => s.trim()).filter(Boolean);
        return b;
      },
      eq(col: string, value: unknown) {
        filters.push({ col, op: "eq", value });
        return b;
      },
      in(col: string, value: unknown[]) {
        filters.push({ col, op: "in", value });
        return b;
      },
      order(col: string) {
        orderCol = col;
        return b;
      },
      maybeSingle() {
        return Promise.resolve(exec(true));
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(exec(false)).then(resolve, reject);
      },
    };
    return b;
  }

  return { client: { from: builder } as unknown as SupabaseClient, calls };
}

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const INVOICE_ID_2 = "22222222-2222-4222-8222-222222222222";

const FULL_INVOICE: Row = {
  id: INVOICE_ID,
  artisan_id: "art-1",
  quote_id: "quote-1",
  invoice_number: "F-2026-0042",
  status: "sent",
  notes: "Chantier Dupont",
  labor_total: "1200.50",
  materials_total: 830,
  grand_total: 2436.6,
  customer_user_id: "cust-1",
  customer_name: "M. Dupont",
  customer_email: "dupont@example.fr",
  created_at: "2026-09-01T08:00:00Z",
  finalized_at: "2026-09-02T08:00:00Z",
  emission_flow: "pa",
  e_invoicing_status: "submitted",
  e_invoicing_rejection_reason: null,
  pa_submission_id: "sub-9",
  invoice_type: "progress",
  due_date: "2026-10-02",
  reminder_count: 2,
  last_reminder_at: "2026-09-20T07:00:00Z",
  retention_amount: "121.83",
  retention_rate: 5,
  retention_released_at: null,
  recovery_status: "formal_notice_sent",
  rubypayeur_case_id: "rp-7",
  progress_percentage: 40,
};

const SECOND_INVOICE: Row = {
  ...FULL_INVOICE,
  id: INVOICE_ID_2,
  invoice_number: null,
  status: "draft",
  finalized_at: null,
  invoice_type: null,
  progress_percentage: null,
  created_at: "2026-09-05T08:00:00Z",
};

describe("loadInvoiceForEditPage — caractérisation", () => {
  it("schéma complet : tous les champs normalisés", async () => {
    const { client } = fakeSupabase({ invoices: [FULL_INVOICE] });
    const res = await loadInvoiceForEditPage(client, INVOICE_ID);
    expect(res).toEqual({
      ok: true,
      invoice: {
        id: INVOICE_ID,
        artisan_id: "art-1",
        quote_id: "quote-1",
        invoice_number: "F-2026-0042",
        status: "sent",
        notes: "Chantier Dupont",
        labor_total: 1200.5,
        materials_total: 830,
        grand_total: 2436.6,
        customer_user_id: "cust-1",
        customer_name: "M. Dupont",
        customer_email: "dupont@example.fr",
        created_at: "2026-09-01T08:00:00Z",
        finalized_at: "2026-09-02T08:00:00Z",
        emission_flow: "pa",
        e_invoicing_status: "submitted",
        e_invoicing_rejection_reason: null,
        pa_submission_id: "sub-9",
        invoice_type: "progress",
        due_date: "2026-10-02",
        reminder_count: 2,
        last_reminder_at: "2026-09-20T07:00:00Z",
        retention_amount: 121.83,
        retention_rate: 5,
        retention_released_at: null,
        recovery_status: "formal_notice_sent",
        rubypayeur_case_id: "rp-7",
      },
    });
  });

  it("migrations BTP absentes : valeurs par défaut BTP, reste intact", async () => {
    const { client } = fakeSupabase({ invoices: [FULL_INVOICE], missingColumns: ["retention_amount"] });
    const res = await loadInvoiceForEditPage(client, INVOICE_ID);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.invoice).toMatchObject({
      invoice_type: "standard",
      due_date: null,
      reminder_count: 0,
      retention_amount: 0,
      retention_rate: 0,
      retention_released_at: null,
      e_invoicing_status: "submitted",
      recovery_status: "formal_notice_sent",
    });
  });

  it("migrations e-invoicing et recouvrement absentes : valeurs par défaut", async () => {
    const { client } = fakeSupabase({
      invoices: [FULL_INVOICE],
      missingColumns: ["emission_flow", "rubypayeur_case_id"],
    });
    const res = await loadInvoiceForEditPage(client, INVOICE_ID);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.invoice).toMatchObject({
      finalized_at: null,
      emission_flow: null,
      e_invoicing_status: null,
      pa_submission_id: null,
      recovery_status: "none",
      rubypayeur_case_id: null,
      retention_amount: 121.83,
      invoice_type: "progress",
    });
  });

  it("erreur non liée au schéma sur un complément : valeurs par défaut, pas d'échec", async () => {
    const { client } = fakeSupabase({ invoices: [FULL_INVOICE], failingColumns: ["recovery_status"] });
    const res = await loadInvoiceForEditPage(client, INVOICE_ID);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.invoice.recovery_status).toBe("none");
    expect(res.invoice.retention_amount).toBe(121.83);
  });

  it("id invalide ou facture absente : not_found", async () => {
    const { client } = fakeSupabase({ invoices: [FULL_INVOICE] });
    expect(await loadInvoiceForEditPage(client, "pas-un-uuid")).toEqual({ ok: false, reason: "not_found" });
    expect(await loadInvoiceForEditPage(client, INVOICE_ID_2)).toEqual({ ok: false, reason: "not_found" });
  });

  it("erreur sur les colonnes de base : load_error", async () => {
    const { client } = fakeSupabase({ invoices: [FULL_INVOICE], failingColumns: ["grand_total"] });
    expect(await loadInvoiceForEditPage(client, INVOICE_ID)).toEqual({
      ok: false,
      reason: "load_error",
      message: "timeout",
    });
  });
});

describe("loadArtisanInvoicesForList — caractérisation", () => {
  it("schéma complet", async () => {
    const { client } = fakeSupabase({ invoices: [FULL_INVOICE, SECOND_INVOICE] });
    const rows = await loadArtisanInvoicesForList(client, "art-1");
    expect(rows).toHaveLength(2);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[INVOICE_ID]).toEqual({
      id: INVOICE_ID,
      artisan_id: "art-1",
      quote_id: "quote-1",
      invoice_number: "F-2026-0042",
      status: "sent",
      notes: "Chantier Dupont",
      labor_total: "1200.50",
      materials_total: 830,
      grand_total: 2436.6,
      customer_user_id: "cust-1",
      customer_name: "M. Dupont",
      customer_email: "dupont@example.fr",
      created_at: "2026-09-01T08:00:00Z",
      finalized_at: "2026-09-02T08:00:00Z",
      emission_flow: "pa",
      e_invoicing_status: "submitted",
      e_invoicing_rejection_reason: null,
      pa_submission_id: "sub-9",
      invoice_type: "progress",
    });
    expect(byId[INVOICE_ID_2]).toMatchObject({ invoice_type: "standard", finalized_at: null, invoice_number: null });
  });

  it("migration e-invoicing absente : valeurs par défaut", async () => {
    const { client } = fakeSupabase({ invoices: [FULL_INVOICE], missingColumns: ["emission_flow"] });
    const [row] = await loadArtisanInvoicesForList(client, "art-1");
    expect(row).toMatchObject({
      finalized_at: null,
      emission_flow: null,
      e_invoicing_status: null,
      e_invoicing_rejection_reason: null,
      pa_submission_id: null,
      invoice_type: "progress",
    });
  });

  it("colonne invoice_type absente : standard", async () => {
    const { client } = fakeSupabase({ invoices: [FULL_INVOICE], missingColumns: ["invoice_type"] });
    const [row] = await loadArtisanInvoicesForList(client, "art-1");
    expect(row.invoice_type).toBe("standard");
    expect(row.e_invoicing_status).toBe("submitted");
  });

  it("aucune facture / erreur de base : liste vide", async () => {
    expect(await loadArtisanInvoicesForList(fakeSupabase({ invoices: [] }).client, "art-1")).toEqual([]);
    const failing = fakeSupabase({ invoices: [FULL_INVOICE], failingColumns: ["grand_total"] });
    expect(await loadArtisanInvoicesForList(failing.client, "art-1")).toEqual([]);
  });

  it("isolation : ne renvoie que les factures de l'artisan demandé", async () => {
    const other = { ...SECOND_INVOICE, artisan_id: "art-2" };
    const rows = await loadArtisanInvoicesForList(fakeSupabase({ invoices: [FULL_INVOICE, other] }).client, "art-1");
    expect(rows.map((r) => r.id)).toEqual([INVOICE_ID]);
  });
});

describe("loadInvoicesForQuote — caractérisation", () => {
  it("schéma complet, tri chronologique", async () => {
    const { client } = fakeSupabase({ invoices: [SECOND_INVOICE, FULL_INVOICE] });
    expect(await loadInvoicesForQuote(client, "quote-1")).toEqual([
      {
        id: INVOICE_ID,
        invoice_number: "F-2026-0042",
        grand_total: 2436.6,
        status: "sent",
        created_at: "2026-09-01T08:00:00Z",
        invoice_type: "progress",
        progress_percentage: 40,
      },
      {
        id: INVOICE_ID_2,
        invoice_number: null,
        grand_total: 2436.6,
        status: "draft",
        created_at: "2026-09-05T08:00:00Z",
        invoice_type: "standard",
        progress_percentage: null,
      },
    ]);
  });

  it("colonnes BTP absentes : standard / null", async () => {
    const { client } = fakeSupabase({ invoices: [FULL_INVOICE], missingColumns: ["progress_percentage"] });
    expect(await loadInvoicesForQuote(client, "quote-1")).toEqual([
      expect.objectContaining({ id: INVOICE_ID, invoice_type: "standard", progress_percentage: null }),
    ]);
  });
});

describe("nombre de requêtes (perf, point 5)", () => {
  it("schéma complet : une seule requête par chargeur", async () => {
    const detail = fakeSupabase({ invoices: [FULL_INVOICE] });
    await loadInvoiceForEditPage(detail.client, INVOICE_ID);
    expect(detail.calls).toHaveLength(1);

    const list = fakeSupabase({ invoices: [FULL_INVOICE, SECOND_INVOICE] });
    await loadArtisanInvoicesForList(list.client, "art-1");
    expect(list.calls).toHaveLength(1);

    const forQuote = fakeSupabase({ invoices: [FULL_INVOICE, SECOND_INVOICE] });
    await loadInvoicesForQuote(forQuote.client, "quote-1");
    expect(forQuote.calls).toHaveLength(1);
  });
});
