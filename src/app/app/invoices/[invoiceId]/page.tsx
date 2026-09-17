import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ArrowLeft, Receipt } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { DownloadInvoicePdfButton } from "@/components/invoices/download-invoice-pdf-button";
import { InvoiceDocumentActionsCard } from "@/components/invoices/invoice-document-actions-card";
import { EInvoicingStatusBadge } from "@/components/invoices/e-invoicing-status-badge";
import { InvoiceReminderButton } from "@/components/invoices/invoice-reminder-button";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import {
  loadInvoiceForEditPage,
  loadInvoiceLinesForEditPage,
  type InvoiceForEditPage,
  type InvoiceLineForEditPage,
} from "@/lib/billing/load-invoice-for-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invoiceLineKindLabel, invoiceStatusLabel } from "@/lib/status-labels";

import { InvoiceEditForm } from "./invoice-edit-form";
import { InvoiceFinalizeForm } from "./invoice-finalize-form";
import { InvoiceVatCorrectionForm } from "./invoice-vat-correction-form";
import { InvoiceAccessDeniedPanel, InvoiceLoadErrorPanel } from "./invoice-status-panels";

export const dynamic = "force-dynamic";

const FINALIZE_ERROR_LABELS: Record<string, string> = {
  not_found: "Facture introuvable.",
  already_finalized: "Cette facture est déjà finalisée.",
  not_draft: "Seul un brouillon peut être finalisé.",
  no_lines: "La facture ne contient aucune ligne.",
  invalid_vat_rate: "Taux de TVA invalide sur une ligne — vérifie/corrige la TVA avant de finaliser.",
  missing_legal_info: "Informations obligatoires manquantes sur ton profil (SIRET / adresse / assurance décennale) — complète-les avant de finaliser.",
  finalize_in_progress: "Une finalisation est déjà en cours pour cette facture — réessaie dans un instant.",
  number_allocation_failed: "Impossible d'attribuer un numéro de facture — réessaie.",
  generation_failed: "Échec de génération du document.",
  pa_submission_failed: "Échec d'envoi à la Plateforme Agréée.",
  persist_failed: "Impossible d'enregistrer la finalisation.",
};

const VALID_VAT_RATES = [0, 5.5, 10, 20];

const ACTION_ERROR_LABELS: Record<string, string> = {
  vat_rate: "Taux de TVA invalide.",
  vat_rate_locked: "Facture déjà finalisée : le taux de TVA n'est plus modifiable.",
  vat_rate_update: "La correction du taux de TVA a échoué.",
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

function displayText(value: unknown, fallback = ""): string {
  return asFormText(value) || fallback;
}

function isNextNavigationError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return digest.startsWith("NEXT_") || (error as { message?: string }).message === "NEXT_REDIRECT";
}

type InvoiceDetailViewProps = {
  invoiceId: string;
  invoice: InvoiceForEditPage;
  sortedLines: InvoiceLineForEditPage[];
  customerLabel: string;
  /** Bloc recouvrement, rendu par le parent qui détient le client Supabase. */
  recoverySlot?: ReactNode;
  /** Actions BTP (avoir, retenue) — même raison : classification B2B/B2C nécessite le client Supabase. */
  btpActionsSlot?: ReactNode;
  finalizeError?: string;
  actionError?: string;
  finalized?: string;
  flow?: string;
  download?: string;
};

function InvoiceDetailView({
  invoiceId,
  invoice,
  sortedLines,
  customerLabel,
  recoverySlot,
  btpActionsSlot,
  finalizeError,
  actionError,
  finalized,
  flow,
  download,
}: InvoiceDetailViewProps) {
  const isDraft = invoice.status === "draft" && !invoice.finalized_at;
  const emissionFlow = invoice.emission_flow as "e_invoicing" | "e_reporting" | null;
  const invoiceTitle = displayText(invoice.invoice_number, "Brouillon");

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Facture</p>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6" />
            {invoiceTitle}
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
                {emissionFlow ? ` · ${FLOW_LABELS[emissionFlow] ?? displayText(emissionFlow)}` : ""}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDraft ? <InvoiceFinalizeForm invoiceId={invoiceId} /> : null}
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
          <p className="mt-1">{displayText(invoice.e_invoicing_rejection_reason)}</p>
        </div>
      ) : null}

      {finalized === "1" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Facture finalisée avec succès
          {flow ? ` (${FLOW_LABELS[flow] ?? displayText(flow)})` : ""}.
          {download === "1" ? " Tu peux télécharger le PDF ci-dessus." : ""}
        </div>
      ) : null}

      {finalizeError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {FINALIZE_ERROR_LABELS[finalizeError] ?? "La finalisation a échoué."}
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {ACTION_ERROR_LABELS[actionError] ?? "L'action a échoué."}
        </div>
      ) : null}

      <InvoiceDocumentActionsCard
        invoiceId={invoiceId}
        emissionFlow={emissionFlow}
        isDraft={isDraft}
      />

      <Card id="invoice-edit">
        <CardHeader>
          <CardTitle>Éditer la facture</CardTitle>
          <CardDescription>
            {isDraft
              ? "Finalise la facture pour déclencher le bon flux (B2B ou B2C). Tu peux encore ajuster le numéro et les notes."
              : "Numéro, statut et notes. Les lignes sont issues du devis."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvoiceEditForm
            invoiceId={invoiceId}
            invoiceNumber={asFormText(invoice.invoice_number)}
            status={displayText(invoice.status, "draft")}
            notes={asFormText(invoice.notes)}
            isDraft={isDraft}
          />
        </CardContent>
      </Card>

      {recoverySlot}

      {!isDraft && invoice.invoice_type !== "credit_note" && invoice.status !== "draft" ? btpActionsSlot : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lignes (reprise du devis)</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const vatRates = Array.from(
              new Set(sortedLines.map((line) => line.vat_rate).filter((r): r is number => r != null)),
            ).sort((a, b) => a - b);
            const hasUnresolvedRate = sortedLines.some((line) => line.vat_rate == null);
            const hasInvalidRate = vatRates.some((r) => !VALID_VAT_RATES.includes(r));
            if (!sortedLines.length) return null;
            return (
              <div className="mb-4 space-y-3">
                <div
                  className={
                    hasInvalidRate || hasUnresolvedRate
                      ? "rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900"
                      : "rounded-lg border bg-muted/30 px-4 py-2 text-sm text-muted-foreground"
                  }
                >
                  TVA appliquée : {vatRates.length ? vatRates.map((r) => `${r} %`).join(" / ") : "—"}
                  {hasUnresolvedRate ? " · taux non résolu sur au moins une ligne" : ""}
                  {hasInvalidRate ? " · taux invalide détecté, la finalisation sera bloquée" : ""}
                  {isDraft && (hasInvalidRate || hasUnresolvedRate)
                    ? " — vérifie le devis d'origine ou corrige ci-dessous avant de finaliser."
                    : ""}
                </div>
                {isDraft ? (
                  <InvoiceVatCorrectionForm invoiceId={invoiceId} defaultRate={vatRates[0] ?? 20} />
                ) : null}
              </div>
            );
          })()}
          {sortedLines.length ? (
            <ul className="divide-y rounded-xl border">
              {sortedLines.map((line, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div>
                    <span className="font-medium">{displayText(line.label, "Ligne")}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {invoiceLineKindLabel(displayText(line.line_kind))}
                    </span>
                  </div>
                  <span className="font-medium">
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((line.line_total ?? 0) / 100)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune ligne enregistrée pour cette facture.</p>
          )}
          <p className="mt-4 text-sm font-semibold">
            Total :{" "}
            {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((invoice.grand_total ?? 0) / 100)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Le bloc recouvrement est optionnel : tant que la migration 11 n'est pas
 * appliquée, ou en cas d'incident, il disparaît au lieu de faire échouer
 * l'affichage de la facture.
 */
async function RecoveryPanel({
  supabase,
  invoice,
  artisanId,
}: {
  supabase: SupabaseClient;
  invoice: InvoiceForEditPage;
  artisanId: string;
}) {
  try {
    const { RecoverySection } = await import("@/components/recovery/recovery-section");
    return <RecoverySection supabase={supabase} invoice={invoice} artisanId={artisanId} />;
  } catch (error) {
    if (isNextNavigationError(error)) throw error;
    console.error("[invoice-detail] recovery_section_failed", {
      invoiceId: invoice.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
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
  const actionError = queryParam(query.error);
  const finalized = queryParam(query.finalized);
  const flow = queryParam(query.flow);
  const download = queryParam(query.download);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Factures indisponibles" />;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect(`/login?next=/app/invoices/${invoiceId}`);

    const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
    if (!profile?.id) {
      return (
        <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-6">
          <h2 className="text-lg font-semibold">Profil artisan incomplet</h2>
          <p className="text-sm text-muted-foreground">Configure ton activité avant d&apos;ouvrir une facture.</p>
          <Link href="/app/reglages?tab=activite" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Mon activité
          </Link>
        </div>
      );
    }

    const loaded = await loadInvoiceForEditPage(supabase, invoiceId);
    if (!loaded.ok) {
      if (loaded.reason === "load_error") {
        console.error("[invoice-detail] load_error", { invoiceId, message: loaded.message });
        return <InvoiceLoadErrorPanel />;
      }
      return <InvoiceAccessDeniedPanel />;
    }

    const invoice = loaded.invoice;
    if (invoice.artisan_id !== profile.id) return <InvoiceAccessDeniedPanel />;

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

    // Vague 7 : le gel ne s'applique plus qu'au B2B (voir invoicing-freeze.ts) — la
    // classification nécessite le client Supabase, donc calculée ici comme recoverySlot,
    // pas dans InvoiceDetailView qui ne le détient pas.
    const invoiceIsDraft = invoice.status === "draft" && !invoice.finalized_at;
    const showBtpActions = !invoiceIsDraft && invoice.invoice_type !== "credit_note" && invoice.status !== "draft";
    let btpActionsSlot: ReactNode = null;
    if (showBtpActions) {
      const { InvoiceBtpActionsCard } = await import("./invoice-btp-actions-card");
      const { resolveCustomerClassification } = await import("@/lib/billing/invoicing/resolve-customer-classification");
      const { frozenInvoicingMessageFor, isDraftInvoicingFrozenForCustomer } = await import(
        "@/lib/billing/invoicing-freeze"
      );
      const invoicingCustomerClass = await resolveCustomerClassification(supabase, invoice.customer_user_id);
      btpActionsSlot = (
        <InvoiceBtpActionsCard
          invoiceId={invoiceId}
          retentionAmount={invoice.retention_amount}
          retentionReleasedAt={invoice.retention_released_at}
          invoicingFrozen={isDraftInvoicingFrozenForCustomer(invoicingCustomerClass)}
          invoicingFrozenMessage={frozenInvoicingMessageFor(invoicingCustomerClass)}
        />
      );
    }

    return (
      <InvoiceDetailView
        invoiceId={invoiceId}
        invoice={invoice}
        sortedLines={sortedLines}
        customerLabel={customerLabel}
        recoverySlot={
          <RecoveryPanel supabase={supabase} invoice={invoice} artisanId={profile.id} />
        }
        btpActionsSlot={btpActionsSlot}
        finalizeError={finalizeError}
        actionError={actionError}
        finalized={finalized}
        flow={flow}
        download={download}
      />
    );
  } catch (error) {
    if (isNextNavigationError(error)) throw error;
    console.error("[invoice-detail] render_failed", {
      invoiceId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return <InvoiceLoadErrorPanel />;
  }
}
