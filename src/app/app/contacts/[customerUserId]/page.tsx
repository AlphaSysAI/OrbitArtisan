import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Receipt } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMissing } from "@/components/supabase-missing";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { artisanCanViewCustomer, getCustomerDeletionCounts } from "@/lib/contacts/actions";
import { invoiceStatusLabel, quoteStatusLabel } from "@/lib/status-labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { DeleteCustomerButton } from "./delete-customer-button";
import { MessageCustomerButton } from "./message-customer-button";

export default async function ArtisanCustomerPage({
  params,
}: {
  params: Promise<{ customerUserId: string }>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Fiche client indisponible" />;
  }

  const { customerUserId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user!.id).maybeSingle();
  if (!profile?.id) notFound();

  const allowed = await artisanCanViewCustomer(customerUserId);
  if (!allowed) notFound();

  const { data: cp } = await supabase
    .from("customer_profiles")
    .select("display_name, email")
    .eq("user_id", customerUserId)
    .maybeSingle();

  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, status, grand_total, created_at")
    .eq("artisan_id", profile.id)
    .eq("customer_user_id", customerUserId)
    .order("created_at", { ascending: false });

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, status, grand_total, created_at")
    .eq("artisan_id", profile.id)
    .eq("customer_user_id", customerUserId)
    .order("created_at", { ascending: false });

  // La suppression n'est proposée que si aucune pièce comptable n'est rattachée.
  const blockedReason = quotes?.length ? ("quotes" as const) : invoices?.length ? ("invoices" as const) : null;
  const deletionCounts = await getCustomerDeletionCounts(customerUserId);

  const formatEur = (cents: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);

  const customerLabel = formatContactDisplayName({
    profileName: cp?.display_name,
    email: cp?.email,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/app/contacts" className={buttonVariants({ variant: "outline", size: "sm" })}>
          ← Contacts
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{customerLabel}</h1>
          {cp?.email && <p className="mt-1 text-sm text-muted-foreground">{cp.email}</p>}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <MessageCustomerButton customerUserId={customerUserId} />
          <DeleteCustomerButton
            customerUserId={customerUserId}
            customerLabel={customerLabel}
            blockedReason={blockedReason}
            counts={deletionCounts}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              Devis
            </CardTitle>
            <CardDescription>Historique des devis pour ce client.</CardDescription>
          </CardHeader>
          <CardContent>
            {!quotes?.length ? (
              <p className="text-sm text-muted-foreground">Aucun devis lié à ce compte.</p>
            ) : (
              <ul className="space-y-2">
                {quotes.map((q) => (
                  <li key={q.id}>
                    <Link
                      href={`/app/quotes/${q.id}`}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                    >
                      <span>
                        {new Date(q.created_at).toLocaleDateString("fr-FR")} ·{" "}
                        <span className="text-muted-foreground">{quoteStatusLabel(q.status)}</span>
                      </span>
                      <span className="font-medium">{formatEur(q.grand_total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/app/quotes/new?customerUserId=${customerUserId}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 inline-flex")}
            >
              Nouveau devis
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="h-5 w-5" />
              Factures
            </CardTitle>
            <CardDescription>Factures émises pour ce client.</CardDescription>
          </CardHeader>
          <CardContent>
            {!invoices?.length ? (
              <p className="text-sm text-muted-foreground">Aucune facture pour ce client.</p>
            ) : (
              <ul className="space-y-2">
                {invoices.map((inv) => (
                  <li key={inv.id}>
                    <Link
                      href={`/app/invoices/${inv.id}`}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                    >
                      <span>
                        {new Date(inv.created_at).toLocaleDateString("fr-FR")} ·{" "}
                        <span className="text-muted-foreground">
                          {invoiceStatusLabel(inv.status)}
                        </span>
                      </span>
                      <span className="font-medium">{formatEur(inv.grand_total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
