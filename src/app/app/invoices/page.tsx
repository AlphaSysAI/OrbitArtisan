import Link from "next/link";

import { FileText, Plus, Receipt } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getStripe, isStripeConfigured } from "@/lib/stripe/server";

import { createInvoiceFromQuoteForm } from "./actions";
import { startStripeExpressOnboarding, withdrawStripeFunds } from "./actions";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Factures indisponibles" />;
  }

  const sp = await searchParams;
  const withdrawSuccess = typeof sp.withdraw_success === "string" ? sp.withdraw_success : undefined;
  const withdrawError = typeof sp.withdraw_error === "string" ? sp.withdraw_error : undefined;
  const stripeOnboarding = typeof sp.stripe_onboarding === "string" ? sp.stripe_onboarding : undefined;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, stripe_account_id, stripe_transfers_enabled, stripe_payouts_enabled")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!profile?.id) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Factures</h1>
        <p className="text-sm text-muted-foreground">Configure d’abord ton activité.</p>
        <Link href="/app/profile" className={buttonVariants({ variant: "outline" })}>
          Mon activité
        </Link>
      </div>
    );
  }

  const stripeEnabled = isStripeConfigured();
  let eurAvailable = 0;
  if (stripeEnabled && profile.stripe_account_id) {
    try {
      const stripe = getStripe();
      const balance = await stripe.balance.retrieve({}, { stripeAccount: profile.stripe_account_id });
      eurAvailable = (balance.available ?? [])
        .filter((b: any) => b.currency === "eur")
        .reduce((sum: number, b: any) => sum + (b.amount ?? 0), 0);
    } catch {
      eurAvailable = 0;
    }
  }

  const { data: acceptedQuotes } = await supabase
    .from("quotes")
    .select("id, customer_name, customer_email, grand_total, created_at, signed_at")
    .eq("artisan_id", profile.id)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });

  const { data: invoiceRows } = await supabase.from("invoices").select("id, quote_id, invoice_number, grand_total, status, created_at").eq("artisan_id", profile.id);

  const invoicedQuoteIds = new Set((invoiceRows ?? []).map((r) => r.quote_id).filter(Boolean));
  const toTransform = (acceptedQuotes ?? []).filter((q) => !invoicedQuoteIds.has(q.id));

  const invoices = (invoiceRows ?? []).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Stripe Connect</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Solde disponible sur ton compte Express et retrait vers ton compte bancaire.
          </p>
        </div>

        {withdrawSuccess ? (
          <Alert>
            <AlertTitle>Retrait déclenché</AlertTitle>
            <AlertDescription>Stripe a bien reçu ta demande de payout.</AlertDescription>
          </Alert>
        ) : null}

        {withdrawError ? (
          <Alert variant="destructive">
            <AlertTitle>Retrait impossible</AlertTitle>
            <AlertDescription>
              {withdrawError === "payouts_not_enabled"
                ? "Ton compte Connect n’a pas encore l’autorisation de payout."
                : withdrawError === "stripe_not_configured"
                  ? "Stripe n’est pas configuré côté serveur."
                  : "Réessaie dans quelques instants."}
            </AlertDescription>
          </Alert>
        ) : null}

        {stripeOnboarding === "return" ? (
          <Alert>
            <AlertTitle>Onboarding terminé</AlertTitle>
            <AlertDescription>Le compte Connect peut encore nécessiter un peu de temps avant d’être prêt.</AlertDescription>
          </Alert>
        ) : null}

        {!stripeEnabled ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Stripe n’est pas activé (variable serveur STRIPE_SECRET_KEY manquante).
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span>Solde disponible</span>
                <span className="font-mono text-base">
                  {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(eurAvailable / 100)}
                </span>
              </CardTitle>
              <CardDescription>
                {profile.stripe_account_id
                  ? profile.stripe_payouts_enabled
                    ? "Tu peux retirer tes fonds."
                    : "Retrait en attente de validation Stripe."
                  : "Active ton compte Connect pour encaisser et retirer."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!profile.stripe_account_id ? (
                <form action={startStripeExpressOnboarding}>
                  <Button type="submit" className="w-full sm:w-auto gap-2">
                    Activer mes paiements
                  </Button>
                </form>
              ) : (
                <form action={withdrawStripeFunds}>
                  <input type="hidden" name="stripe_account_id" value={profile.stripe_account_id} />
                  <Button
                    type="submit"
                    className="w-full sm:w-auto"
                    disabled={!profile.stripe_payouts_enabled || eurAvailable <= 0}
                  >
                    Retirer mes fonds
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      <div>
        <p className="text-sm font-medium text-muted-foreground">Section</p>
        <h1 className="text-2xl font-semibold tracking-tight">Factures</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Transforme un devis accepté en facture, puis ajuste le libellé et le statut.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Devis à transformer</h2>
        {!toTransform.length ? (
          <p className="rounded-2xl border border-dashed bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
            Aucun devis accepté en attente de facture.
          </p>
        ) : (
          <ul className="space-y-2">
            {toTransform.map((q) => (
              <li
                key={q.id}
                className="flex flex-col gap-3 rounded-2xl border-2 border-amber-500/50 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{q.customer_name || q.customer_email || "Client"}</p>
                  <p className="text-sm text-muted-foreground">
                    Total{" "}
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((q.grand_total ?? 0) / 100)}
                    {q.signed_at
                      ? ` · Signé le ${new Date(q.signed_at).toLocaleDateString("fr-FR")}`
                      : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/app/quotes/${q.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Voir le devis
                  </Link>
                  <form action={createInvoiceFromQuoteForm}>
                    <input type="hidden" name="quote_id" value={q.id} />
                    <button type="submit" className={buttonVariants({ size: "sm", className: "gap-2" })}>
                      <Plus className="h-4 w-4" />
                      Créer la facture
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Mes factures</h2>
        {!invoices.length ? (
          <Card className="border-0 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-5 w-5" />
                Aucune facture
              </CardTitle>
              <CardDescription>Crée une facture depuis un devis accepté ci-dessus.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="space-y-2">
            {invoices.map((inv) => (
              <li key={inv.id} className="rounded-2xl border bg-card p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-mono text-sm font-medium">{inv.invoice_number ?? inv.id.slice(0, 8)}</p>
                    <p className="text-sm text-muted-foreground">
                      {inv.status}
                      {" · "}
                      {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((inv.grand_total ?? 0) / 100)}
                    </p>
                  </div>
                  <Link href={`/app/invoices/${inv.id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "gap-2" })}>
                    <FileText className="h-4 w-4" />
                    Éditer
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
