import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ArrowLeft, Receipt } from "lucide-react";

import { InvoicePaymentRefresh } from "@/components/compte/invoice-payment-refresh";
import { PayInvoiceForm } from "@/components/compte/pay-invoice-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMissing } from "@/components/supabase-missing";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { invoiceLineKindLabel, invoiceStatusLabel } from "@/lib/status-labels";
import { isStripeConfigured } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  PaymentCanceledAlert,
  PaymentErrorAlert,
  PaymentPaidAlert,
  PaymentPendingAlert,
} from "../payment-alerts";

export default async function ClientInvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { invoiceId } = await params;
  const sp = await searchParams;

  const payment = typeof sp.payment === "string" ? sp.payment : undefined;
  const paymentError = typeof sp.payment_error === "string" ? sp.payment_error : undefined;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Facture indisponible" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/compte/factures/${invoiceId}`)}`);

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, artisan_id, quote_id, invoice_number, status, notes, labor_total, materials_total, grand_total, customer_name, customer_email, created_at, updated_at, customer_user_id",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice || invoice.customer_user_id !== user.id) {
    notFound();
  }

  const { data: cp } = await supabase
    .from("customer_profiles")
    .select("display_name, email")
    .eq("user_id", user.id)
    .maybeSingle();

  const customerLabel = formatContactDisplayName({
    profileName: cp?.display_name,
    name: invoice.customer_name,
    email: cp?.email ?? invoice.customer_email,
  });

  const stripeEnabled = isStripeConfigured();
  const showPaidBanner = payment === "success" && invoice.status === "paid";
  const showPendingBanner = payment === "success" && invoice.status === "sent";
  const showCanceledBanner = payment === "canceled";

  if (invoice.status === "draft") {
    return (
      <div className="space-y-6">
        <Link href="/compte/factures" className={buttonVariants({ variant: "outline", size: "sm", className: "gap-2" })}>
          <ArrowLeft className="h-4 w-4" />
          Factures
        </Link>
        <PaymentErrorAlert code={paymentError} />
        <Card>
          <CardHeader>
            <CardTitle>Facture en préparation</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Cette facture est encore en brouillon côté artisan. Tu la verras en détail une fois qu’elle sera envoyée.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: artisan } = await supabase
    .from("profiles")
    .select("business_name, stripe_transfers_enabled")
    .eq("id", invoice.artisan_id)
    .maybeSingle();

  const { data: lines } = await supabase
    .from("invoice_lines")
    .select("line_kind, label, quantity, unit_price, line_total, sort_order")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });

  const sortedLines = lines ?? [];

  return (
    <div className="space-y-8">
      {showPendingBanner ? <InvoicePaymentRefresh expectPaid /> : null}

      <PaymentErrorAlert code={paymentError} />
      <PaymentCanceledAlert show={showCanceledBanner} />
      <PaymentPaidAlert show={showPaidBanner} />
      {showPendingBanner ? <PaymentPendingAlert /> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Facture</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            <Receipt className="h-7 w-7" />
            {invoice.invoice_number ?? "Facture"}
            <Badge variant={invoice.status === "paid" ? "default" : "secondary"}>{invoiceStatusLabel(invoice.status)}</Badge>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {artisan?.business_name ?? "Artisan"}
            {customerLabel !== "Client" ? ` · ${customerLabel}` : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Émise le{" "}
            {new Date(invoice.created_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/mes-devis/${invoice.quote_id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Voir le devis d’origine
          </Link>
          <Link href="/compte/factures" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Toutes les factures
          </Link>
        </div>
      </div>

      {invoice.status === "sent" ? (
        <Card className="border-primary/30 bg-muted/20">
          <CardHeader>
            <CardTitle className="text-lg">Règlement</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total à payer</p>
              <p className="text-2xl font-semibold tabular-nums">
                {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                  (invoice.grand_total ?? 0) / 100,
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {stripeEnabled && artisan?.stripe_transfers_enabled ? (
                <PayInvoiceForm invoiceId={invoice.id} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Paiement en ligne indisponible (activation des paiements en cours ?).
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {invoice.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">{invoice.notes}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lignes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-xl border">
            {sortedLines.map((line, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <span className="font-medium">{line.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{invoiceLineKindLabel(line.line_kind)}</span>
                </div>
                <span className="font-medium tabular-nums">
                  {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                    (line.line_total ?? 0) / 100,
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm font-semibold">
            Total :{" "}
            {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
              (invoice.grand_total ?? 0) / 100,
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
