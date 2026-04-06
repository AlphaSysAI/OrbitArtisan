import Link from "next/link";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";

import { PayInvoiceForm } from "@/components/compte/pay-invoice-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMissing } from "@/components/supabase-missing";
import { isStripeConfigured } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PaymentErrorAlert } from "./payment-alerts";

function statusLabel(status: string) {
  if (status === "sent") return "Envoyée";
  if (status === "paid") return "Payée";
  return status;
}

export default async function ClientInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Factures indisponibles" />;
  }

  const sp = await searchParams;
  const paymentError = typeof sp.payment_error === "string" ? sp.payment_error : undefined;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/compte/factures");

  const stripeEnabled = isStripeConfigured();

  const { data: rows } = await supabase
    .from("invoices")
    .select("id, artisan_id, quote_id, invoice_number, status, grand_total, created_at, updated_at")
    .eq("customer_user_id", user.id)
    .in("status", ["sent", "paid"])
    .order("updated_at", { ascending: false });

  const invoices = rows ?? [];
  const artisanIds = [...new Set(invoices.map((i) => i.artisan_id).filter(Boolean))] as string[];
  const { data: artisans } = artisanIds.length
    ? await supabase.from("profiles").select("id, business_name, stripe_transfers_enabled").in("id", artisanIds)
    : { data: [] as { id: string; business_name: string; stripe_transfers_enabled: boolean }[] };

  const artisanForId = (id: string) => artisans?.find((a) => a.id === id);
  const artisanName = (id: string) => artisanForId(id)?.business_name ?? "Artisan";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Factures</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Les factures que tes artisans ont passées en « envoyée » ou « payée » apparaissent ici. Tu peux payer en ligne si c’est
          activé.
        </p>
      </div>

      <PaymentErrorAlert code={paymentError} />

      {!invoices.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="h-5 w-5" />
              Aucune facture reçue
            </CardTitle>
            <CardDescription>
              Quand un artisan enverra une facture après ton devis accepté, tu la verras ici.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {invoices.map((inv) => (
            <li key={inv.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-semibold">{inv.invoice_number ?? inv.id.slice(0, 8)}</p>
                    <Badge variant={inv.status === "paid" ? "default" : "secondary"}>{statusLabel(inv.status)}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{artisanName(inv.artisan_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(inv.updated_at ?? inv.created_at).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="text-sm font-semibold tabular-nums">
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
                      (inv.grand_total ?? 0) / 100,
                    )}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {inv.status === "sent" && stripeEnabled && artisanForId(inv.artisan_id)?.stripe_transfers_enabled ? (
                      <PayInvoiceForm invoiceId={inv.id} />
                    ) : null}
                    {inv.status === "sent" && !stripeEnabled ? (
                      <span className="text-xs text-muted-foreground">Paiement en ligne indisponible</span>
                    ) : null}
                    <Link href={`/compte/factures/${inv.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                      Voir le détail
                    </Link>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
