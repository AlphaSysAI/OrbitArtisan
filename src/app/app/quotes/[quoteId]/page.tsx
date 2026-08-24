import Link from "next/link";

import { ArrowLeft, FileText, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { quoteStatusLabel } from "@/lib/status-labels";
import { cn } from "@/lib/utils";

import { QuoteSummary } from "@/components/ai/quote-summary";
import { BtpInvoiceActions } from "@/components/quotes/btp-invoice-actions";
import { QuotePublicLinkCard } from "@/components/quotes/quote-public-link-card";
import { DuplicateQuoteButton } from "@/components/quotes/duplicate-quote-button";
import { invoiceTypeLabel } from "@/lib/billing/invoice-types";
import { loadInvoicesForQuote } from "@/lib/billing/load-invoice-for-page";
import { getPublicSiteUrl } from "@/lib/site-url";

import { createInvoiceFromQuoteForm } from "../../invoices/actions";

export default async function QuoteDetailPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const sp = await params;
  const quoteId = sp.quoteId;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Devis indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id,status,customer_user_id,customer_name,customer_email,conversation_id,signed_at,signed_by_name,rejected_at,labor_rate_per_hour,labor_duration_minutes,labor_total,materials_total,grand_total,notes,created_at,updated_at,reduced_vat_rate,generate_vat_attestation,work_site_address,public_token,viewed_at,sent_at",
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (!quote) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Devis</h1>
        <p className="text-sm text-muted-foreground">Devis introuvable (ou pas accessible).</p>
        <Link href="/app/quotes" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Link>
      </div>
    );
  }

  const { data: serviceLines } = await supabase
    .from("quote_services")
    .select("service_title,duration_minutes,unit_price,line_total")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true });

  const { data: materialLines } = await supabase
    .from("quote_materials")
    .select("label,quantity,unit_price,line_total")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true });

  const services = serviceLines ?? [];
  const materials = materialLines ?? [];
  const conversationId = (quote as { conversation_id?: string | null }).conversation_id ?? null;

  let profileDisplayName: string | null = null;
  if (quote.customer_user_id) {
    const { data: cp } = await supabase
      .from("customer_profiles")
      .select("display_name, email")
      .eq("user_id", quote.customer_user_id)
      .maybeSingle();
    profileDisplayName = formatContactDisplayName({
      profileName: cp?.display_name,
      email: cp?.email,
    });
  }

  const customerLabel = formatContactDisplayName({
    profileName: profileDisplayName,
    name: quote.customer_name,
    email: quote.customer_email,
  });

  const linkedInvoices = await loadInvoicesForQuote(supabase, quoteId);

  const alreadyInvoicedCents = linkedInvoices
    .filter((inv) => inv.invoice_type !== "credit_note")
    .reduce((acc, inv) => acc + (inv.grand_total ?? 0), 0);

  const q = quote as typeof quote & {
    signed_at?: string | null;
    signed_by_name?: string | null;
    rejected_at?: string | null;
  };

  const frameClass =
    q.status === "accepted"
      ? "border-2 border-green-600/70 shadow-sm shadow-green-600/10"
      : q.status === "rejected"
        ? "border-2 border-red-600/70 shadow-sm shadow-red-600/10"
        : "border border-border";

  const publicToken = (quote as { public_token?: string }).public_token;
  const publicUrl = publicToken ? `${getPublicSiteUrl()}/devis/${publicToken}` : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Devis</p>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {customerLabel}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Statut : {quoteStatusLabel(quote.status)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {conversationId ? (
            <Link
              href={`/app/messages/${conversationId}`}
              className={buttonVariants({ variant: "secondary", size: "sm", className: "gap-2" })}
            >
              <MessageSquare className="h-4 w-4" />
              Conversation
            </Link>
          ) : null}
          <Link href="/app/quotes" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Link>
          <a
            href={`/api/quotes/${quoteId}/pdf`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
            download
          >
            PDF devis
          </a>
          <DuplicateQuoteButton quoteId={quoteId} />
        </div>
      </div>

      <div className={cn("grid gap-6 rounded-2xl p-4 lg:grid-cols-[1fr_360px] lg:p-6", frameClass)}>
        <div className="space-y-6">
          <Card className="border-0 shadow-none">
            <CardHeader>
              <CardTitle className="text-xl">Prestations</CardTitle>
              <CardDescription>Les lignes prestations utilisées pour calculer la main d&apos;œuvre.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!services.length ? (
                <p className="text-sm text-muted-foreground">Aucune prestation.</p>
              ) : (
                <ul className="space-y-2">
                  {services.map((s, i) => (
                    <li key={`${s.service_title}-${i}`} className="rounded-xl border bg-card p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium">{s.service_title}</p>
                          <p className="text-sm text-muted-foreground">{s.duration_minutes} min</p>
                        </div>
                        {s.unit_price != null ? (
                          <p className="text-sm font-medium">
                            {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((s.unit_price ?? 0) / 100)}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">sur devis</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-none">
            <CardHeader>
              <CardTitle className="text-xl">Fournitures</CardTitle>
              <CardDescription>Matériel ajouté manuellement par l&apos;artisan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!materials.length ? (
                <p className="text-sm text-muted-foreground">Aucune fourniture.</p>
              ) : (
                <ul className="space-y-2">
                  {materials.map((m, i) => (
                    <li key={`${m.label}-${i}`} className="rounded-xl border bg-card p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium">{m.label}</p>
                          <p className="text-sm text-muted-foreground">
                            Qté {m.quantity} ·{" "}
                            {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((m.unit_price ?? 0) / 100)} / unité
                          </p>
                        </div>
                        <p className="text-sm font-medium">
                          {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((m.line_total ?? 0) / 100)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {quote.notes ? (
            <Card className="border-0 shadow-none">
              <CardHeader>
                <CardTitle className="text-xl">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{quote.notes}</p>
              </CardContent>
            </Card>
          ) : null}

          <QuoteSummary quoteId={quoteId} />
        </div>

        <div className="space-y-6">
          {publicUrl ? (
            <QuotePublicLinkCard
              publicUrl={publicUrl}
              viewedAt={(quote as { viewed_at?: string | null }).viewed_at ?? null}
            />
          ) : null}

          <Card className="border-0 shadow-none">
            <CardHeader>
              <CardTitle className="text-xl">Total</CardTitle>
              <CardDescription>Détail du calcul</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span>Main d&apos;œuvre</span>
                  <span className="font-medium">
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((quote.labor_total ?? 0) / 100)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{quote.labor_duration_minutes} min · {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((quote.labor_rate_per_hour ?? 0) / 100)}/h</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Fournitures</span>
                  <span className="font-medium">
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((quote.materials_total ?? 0) / 100)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 text-base font-semibold">
                  <span>Total devis</span>
                  <span>{new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((quote.grand_total ?? 0) / 100)}</span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Créé le {new Date(quote.created_at).toLocaleString("fr-FR")} · Mis à jour le{" "}
                {new Date(quote.updated_at).toLocaleString("fr-FR")}
              </div>

              {q.status === "accepted" && q.signed_at && (
                <div className="rounded-xl border border-green-600/30 bg-green-500/5 p-3 text-sm">
                  <p className="font-medium text-green-900 dark:text-green-100">Accepté par le client</p>
                  <p className="mt-1 text-muted-foreground">
                    Signature : <span className="font-medium text-foreground">{q.signed_by_name}</span>
                    {" · "}
                    {new Date(q.signed_at).toLocaleString("fr-FR")}
                  </p>
                </div>
              )}

              {q.status === "rejected" && q.rejected_at && (
                <div className="rounded-xl border border-red-600/30 bg-red-500/5 p-3 text-sm text-muted-foreground">
                  Refusé le {new Date(q.rejected_at).toLocaleString("fr-FR")}
                </div>
              )}

              {q.status === "accepted" ? (
                <>
                  {linkedInvoices.length > 0 ? (
                    <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Factures liées</p>
                      <ul className="space-y-2 text-sm">
                        {linkedInvoices.map((inv) => (
                          <li key={inv.id} className="flex items-center justify-between gap-2">
                            <Link href={`/app/invoices/${inv.id}`} className="font-medium underline-offset-4 hover:underline">
                              {invoiceTypeLabel(inv.invoice_type)}
                              {inv.progress_percentage != null ? ` (${inv.progress_percentage} %)` : ""}
                            </Link>
                            <span className="tabular-nums">
                              {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                                (inv.grand_total ?? 0) / 100,
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <BtpInvoiceActions
                    quoteId={quoteId}
                    quoteGrandTotalCents={quote.grand_total ?? 0}
                    alreadyInvoicedCents={alreadyInvoicedCents}
                  />

                  {alreadyInvoicedCents < (quote.grand_total ?? 0) ? (
                    <form action={createInvoiceFromQuoteForm}>
                      <input type="hidden" name="quote_id" value={quoteId} />
                      <Button type="submit" className="w-full" variant="default">
                        {alreadyInvoicedCents > 0 ? "Créer facture de solde" : "Créer la facture à partir du devis"}
                      </Button>
                    </form>
                  ) : null}

                  {(quote as { generate_vat_attestation?: boolean }).generate_vat_attestation ? (
                    <a
                      href={`/api/quotes/${quoteId}/vat-attestation`}
                      className={buttonVariants({ variant: "outline", className: "w-full justify-center" })}
                      download
                    >
                      Télécharger attestation TVA (PDF)
                    </a>
                  ) : null}
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

