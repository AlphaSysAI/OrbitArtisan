import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ArrowLeft, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SupabaseMissing } from "@/components/supabase-missing";
import { DownloadInvoicePdfButton } from "@/components/invoices/download-invoice-pdf-button";
import { EInvoicingStatusBadge } from "@/components/invoices/e-invoicing-status-badge";
import { FinalizeInvoiceButton } from "@/components/invoices/finalize-invoice-button";
import { InvoiceReminderButton } from "@/components/invoices/invoice-reminder-button";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { loadInvoiceForEditPage, loadInvoiceLinesForEditPage } from "@/lib/billing/load-invoice-for-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invoiceLineKindLabel, invoiceStatusLabel } from "@/lib/status-labels";

import { updateInvoice } from "../actions";
import { createCreditNoteForm, releaseRetentionForm } from "../btp-actions";

const FINALIZE_ERROR_LABELS: Record<string, string> = {
  not_found: "Facture introuvable.",
  already_finalized: "Cette facture est déjà finalisée.",
  not_draft: "Seul un brouillon peut être finalisé.",
  no_lines: "La facture ne contient aucune ligne.",
  generation_failed: "Échec de génération du document.",
  pa_submission_failed: "Échec d'envoi à la Plateforme Agréée.",
  persist_failed: "Impossible d'enregistrer la finalisation.",
};

const FLOW_LABELS: Record<string, string> = {
  e_invoicing: "E-invoicing (B2B — Factur-X + PA)",
  e_reporting: "E-reporting (B2C — PDF + file d'attente)",
};

function queryParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function asFormText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export default async function InvoiceEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { invoiceId } = await params;
  const query = await searchParams;
  const finalizeError = queryParam(query.finalize_error);
  const finalized = queryParam(query.finalized);
  const flow = queryParam(query.flow);
  const download = queryParam(query.download);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Factures indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/app/invoices/${invoiceId}`);

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) redirect("/app/reglages?tab=activite");

  const loaded = await loadInvoiceForEditPage(supabase, invoiceId);
  if (!loaded.ok) {
    if (loaded.reason === "not_found") notFound();
    return (
      <div className="space-y-4 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-lg font-semibold">Impossible de charger cette facture</h2>
        <p className="text-sm text-muted-foreground">
          La base de données a renvoyé une erreur inattendue. Réessaie dans un instant ou contacte le support.
        </p>
        <Link href="/app/invoices" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Retour aux factures
        </Link>
      </div>
    );
  }

  const invoice = loaded.invoice;
  if (invoice.artisan_id !== profile.id) notFound();

  let profileDisplayName: string | null = null;
  if (invoice.customer_user_id) {
    const { data: cp } = await supabase
      .from("customer_profiles")
      .select("display_name, email")
      .eq("user_id", invoice.customer_user_id)
      .maybeSingle();
    profileDisplayName = formatContactDisplayName({
      profileName: cp?.display_name,
      email: cp?.email,
    });
  }

  const customerLabel = formatContactDisplayName({
    profileName: profileDisplayName,
    name: invoice.customer_name,
    email: invoice.customer_email,
  });

  const sortedLines = await loadInvoiceLinesForEditPage(supabase, invoiceId);
  const isDraft = invoice.status === "draft" && !invoice.finalized_at;
  const emissionFlow = invoice.emission_flow as "e_invoicing" | "e_reporting" | null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Facture</p>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            {invoice.invoice_number ?? "Brouillon"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customerLabel} ·{" "}
            {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((invoice.grand_total ?? 0) / 100)}
          </p>
          {invoice.finalized_at ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <EInvoicingStatusBadge status={invoice.e_invoicing_status} emissionFlow={emissionFlow} />
              <span className="text-sm text-muted-foreground">
                Finalisée · {invoiceStatusLabel(invoice.status)}
                {invoice.due_date
                  ? ` · Échéance ${new Date(invoice.due_date).toLocaleDateString("fr-FR")}`
                  : ""}
                {emissionFlow ? ` · ${FLOW_LABELS[emissionFlow] ?? emissionFlow}` : ""}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDraft ? <FinalizeInvoiceButton invoiceId={invoiceId} /> : null}
          {!isDraft && (invoice.status === "sent" || invoice.status === "overdue") ? (
            <InvoiceReminderButton invoiceId={invoiceId} />
          ) : null}
          <DownloadInvoicePdfButton invoiceId={invoiceId} emissionFlow={emissionFlow} />
          {invoice.quote_id ? (
            <Link href={`/app/quotes/${invoice.quote_id}`} className="text-sm text-primary underline-offset-4 hover:underline">
              Voir le devis d&apos;origine
            </Link>
          ) : null}
          <Link href="/app/invoices" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Factures
          </Link>
        </div>
      </div>

      {invoice.e_invoicing_status === "REJECTED" && invoice.e_invoicing_rejection_reason ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p className="font-medium">Facture refusée par le client ou la PA</p>
          <p className="mt-1">{invoice.e_invoicing_rejection_reason}</p>
        </div>
      ) : null}

      {finalized === "1" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Facture finalisée avec succès
          {flow ? ` (${FLOW_LABELS[flow] ?? flow})` : ""}.
          {download === "1" ? " Tu peux télécharger le PDF ci-dessus." : ""}
        </div>
      ) : null}

      {finalizeError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {FINALIZE_ERROR_LABELS[finalizeError] ?? "La finalisation a échoué."}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Éditer la facture</CardTitle>
          <CardDescription>
            {isDraft
              ? "Finalise la facture pour déclencher le bon flux (B2B ou B2C). Tu peux encore ajuster le numéro et les notes."
              : "Numéro, statut et notes. Les lignes sont issues du devis."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateInvoice} className="space-y-6">
            <input type="hidden" name="invoice_id" value={invoiceId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invoice_number">Numéro de facture</Label>
                <Input
                  id="invoice_number"
                  name="invoice_number"
                  defaultValue={asFormText(invoice.invoice_number)}
                  placeholder="FAC-…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Statut</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={invoice.status ?? "draft"}
                  disabled={isDraft}
                  className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm disabled:opacity-60"
                >
                  <option value="draft">Brouillon</option>
                  <option value="sent">Envoyée</option>
                  <option value="overdue">En retard</option>
                  <option value="paid">Payée</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" defaultValue={asFormText(invoice.notes)} rows={4} />
            </div>
            <Button type="submit">Enregistrer</Button>
          </form>
        </CardContent>
      </Card>

      {!isDraft && invoice.invoice_type !== "credit_note" && invoice.status !== "draft" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Actions BTP</CardTitle>
            <CardDescription>Avoir, retenue de garantie</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <form action={createCreditNoteForm}>
              <input type="hidden" name="invoice_id" value={invoiceId} />
              <Button type="submit" variant="outline" size="sm">
                Créer un avoir
              </Button>
            </form>
            {invoice.retention_amount > 0 && !invoice.retention_released_at ? (
              <form action={releaseRetentionForm}>
                <input type="hidden" name="invoice_id" value={invoiceId} />
                <Button type="submit" variant="outline" size="sm">
                  Libérer retenue (
                  {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                    invoice.retention_amount / 100,
                  )}
                  )
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lignes (reprise du devis)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-xl border">
            {sortedLines.map((line, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <span className="font-medium">{line.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{invoiceLineKindLabel(line.line_kind)}</span>
                </div>
                <span className="font-medium">
                  {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((line.line_total ?? 0) / 100)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm font-semibold">
            Total :{" "}
            {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((invoice.grand_total ?? 0) / 100)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
