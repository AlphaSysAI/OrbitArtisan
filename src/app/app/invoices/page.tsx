import Link from "next/link";
import { Banknote, FileText, Plus, Receipt, Wallet } from "lucide-react";

import { AppEmptyState } from "@/components/app/app-empty-state";
import { AppListItem } from "@/components/app/app-list-item";
import { AppPageHeader } from "@/components/app/app-page-header";
import { EInvoicingStatusBadge } from "@/components/invoices/e-invoicing-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { loadCustomerDisplayNames } from "@/lib/contacts/load-profile-display-names";
import { invoiceStatusLabel } from "@/lib/status-labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { withdrawErrorMessage } from "@/lib/stripe/user-messages";

import { createInvoiceFromQuoteForm, startStripeExpressOnboarding, withdrawStripeFunds } from "./actions";

function formatEur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

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
      <div className="space-y-8">
        <AppPageHeader eyebrow="Encaissement" title="Factures" />
        <AppEmptyState
          icon={Receipt}
          title="Configure d’abord ton activité"
          description="Une fois ton profil prêt, tu pourras transformer les devis acceptés en factures."
          action={
            <Link href="/app/reglages?tab=activite" className={buttonVariants({ size: "lg" })}>
              Mon activité
            </Link>
          }
        />
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
        .filter((b: { currency: string }) => b.currency === "eur")
        .reduce((sum: number, b: { amount?: number }) => sum + (b.amount ?? 0), 0);
    } catch {
      eurAvailable = 0;
    }
  }

  const { data: acceptedQuotes } = await supabase
    .from("quotes")
    .select("id, customer_user_id, customer_name, customer_email, grand_total, created_at, signed_at")
    .eq("artisan_id", profile.id)
    .eq("status", "accepted")
    .order("created_at", { ascending: false });

  const { data: invoiceRows } = await supabase
    .from("invoices")
    .select(
      "id, quote_id, customer_user_id, customer_name, customer_email, invoice_number, grand_total, status, created_at, emission_flow, e_invoicing_status, e_invoicing_rejection_reason, finalized_at",
    )
    .eq("artisan_id", profile.id);

  const profileNames = await loadCustomerDisplayNames(supabase, [
    ...(acceptedQuotes ?? []).map((q) => q.customer_user_id),
    ...(invoiceRows ?? []).map((inv) => inv.customer_user_id),
  ]);

  const invoicedQuoteIds = new Set((invoiceRows ?? []).map((r) => r.quote_id).filter(Boolean));
  const toTransform = (acceptedQuotes ?? []).filter((q) => !invoicedQuoteIds.has(q.id));

  const invoices = (invoiceRows ?? []).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="space-y-10">
      <AppPageHeader
        eyebrow="Encaissement"
        title="Factures"
        description="Transforme un devis accepté en facture, puis suis tes paiements."
      />

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="app-surface relative overflow-hidden p-6">
          <div className="absolute -right-8 -top-8 size-32 rounded-full bg-brand/10 blur-2xl" aria-hidden />
          <div className="relative space-y-5">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand/15 text-brand">
                <Wallet className="size-5" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Paiements en ligne
                </p>
                <h2 className="font-display text-xl font-semibold tracking-tight">Solde disponible</h2>
              </div>
            </div>

            {withdrawSuccess ? (
              <Alert>
                <AlertTitle>Retrait déclenché</AlertTitle>
                <AlertDescription>La demande de versement a bien été envoyée.</AlertDescription>
              </Alert>
            ) : null}

            {withdrawError ? (
              <Alert variant="destructive">
                <AlertTitle>Retrait impossible</AlertTitle>
                <AlertDescription>{withdrawErrorMessage(withdrawError)}</AlertDescription>
              </Alert>
            ) : null}

            {stripeOnboarding === "return" ? (
              <Alert>
                <AlertTitle>Configuration terminée</AlertTitle>
                <AlertDescription>
                  Ton compte de paiement peut encore nécessiter un peu de temps avant d’être pleinement actif.
                </AlertDescription>
              </Alert>
            ) : null}

            {!stripeEnabled ? (
              <p className="text-sm text-muted-foreground">
                Les paiements en ligne ne sont pas activés sur ce site.
              </p>
            ) : (
              <>
                <p className="font-display text-4xl font-semibold tabular-nums tracking-tight">
                  {formatEur(eurAvailable)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {profile.stripe_account_id
                    ? profile.stripe_payouts_enabled
                      ? "Tu peux retirer tes fonds vers ton compte bancaire."
                      : "Retrait en attente de validation du compte de paiement."
                    : "Active les paiements en ligne pour encaisser et retirer."}
                </p>
                {!profile.stripe_account_id ? (
                  <form action={startStripeExpressOnboarding}>
                    <Button type="submit" size="lg" className="w-full gap-2 sm:w-auto">
                      <Banknote className="size-4" />
                      Activer mes paiements
                    </Button>
                  </form>
                ) : (
                  <form action={withdrawStripeFunds}>
                    <input type="hidden" name="stripe_account_id" value={profile.stripe_account_id} />
                    <Button
                      type="submit"
                      size="lg"
                      className="w-full sm:w-auto"
                      disabled={!profile.stripe_payouts_enabled || eurAvailable <= 0}
                    >
                      Retirer mes fonds
                    </Button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>

        <div className="app-surface-muted flex flex-col justify-center gap-3 p-6">
          <h2 className="font-display text-lg font-semibold tracking-tight">Astuce rapide</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Un devis accepté devient une facture en un tap. Tu peux ensuite ajuster le statut et suivre le
            paiement.
          </p>
          <Link href="/app/quotes" className={buttonVariants({ variant: "outline", size: "lg", className: "mt-2 w-fit" })}>
            Voir les devis
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold tracking-tight">Devis à transformer</h2>
        {!toTransform.length ? (
          <AppEmptyState
            icon={FileText}
            title="Rien à facturer"
            description="Aucun devis accepté en attente de facture."
            className="py-12 sm:py-14"
          />
        ) : (
          <ul className="space-y-3">
            {toTransform.map((q) => (
              <li key={q.id}>
                <AppListItem
                  title={formatContactDisplayName({
                    profileName: q.customer_user_id ? profileNames.get(q.customer_user_id) : null,
                    name: q.customer_name,
                    email: q.customer_email,
                  })}
                  subtitle={
                    <>
                      Total {formatEur(q.grand_total ?? 0)}
                      {q.signed_at
                        ? ` · Signé le ${new Date(q.signed_at).toLocaleDateString("fr-FR")}`
                        : null}
                    </>
                  }
                  meta={<Badge variant="secondary">À facturer</Badge>}
                  emphasis="warning"
                  trailing={
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/app/quotes/${q.id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Voir
                      </Link>
                      <form action={createInvoiceFromQuoteForm}>
                        <input type="hidden" name="quote_id" value={q.id} />
                        <Button type="submit" size="sm" className="gap-1.5">
                          <Plus className="size-4" />
                          Créer
                        </Button>
                      </form>
                    </div>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold tracking-tight">Mes factures</h2>
        {!invoices.length ? (
          <AppEmptyState
            icon={Receipt}
            title="Aucune facture"
            description="Crée une facture depuis un devis accepté ci-dessus."
            className="py-12 sm:py-14"
          />
        ) : (
          <ul className="space-y-3">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <AppListItem
                  href={`/app/invoices/${inv.id}`}
                  title={
                    <span className="font-mono text-sm">{inv.invoice_number ?? inv.id.slice(0, 8)}</span>
                  }
                  subtitle={
                    <>
                      {formatContactDisplayName({
                        profileName: inv.customer_user_id ? profileNames.get(inv.customer_user_id) : null,
                        name: inv.customer_name,
                        email: inv.customer_email,
                      })}
                      {" · "}
                      {invoiceStatusLabel(inv.status)} · {formatEur(inv.grand_total ?? 0)}
                      {inv.e_invoicing_rejection_reason ? (
                        <span className="mt-0.5 block text-destructive">
                          Refus PA : {inv.e_invoicing_rejection_reason}
                        </span>
                      ) : null}
                    </>
                  }
                  meta={
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <EInvoicingStatusBadge
                        status={inv.e_invoicing_status}
                        emissionFlow={inv.emission_flow as "e_invoicing" | "e_reporting" | null}
                      />
                      <Badge variant={inv.status === "paid" ? "default" : "secondary"}>
                        {invoiceStatusLabel(inv.status)}
                      </Badge>
                    </div>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
