import Link from "next/link";
import { notFound } from "next/navigation";

import { ArrowLeft, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { invoiceLineKindLabel } from "@/lib/status-labels";

import { updateInvoice } from "../actions";

export default async function InvoiceEditPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Factures indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user!.id).maybeSingle();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, artisan_id, quote_id, invoice_number, status, notes, labor_total, materials_total, grand_total, customer_name, created_at",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice || !profile?.id || invoice.artisan_id !== profile.id) {
    notFound();
  }

  const { data: lines } = await supabase
    .from("invoice_lines")
    .select("line_kind, label, quantity, unit_price, line_total, sort_order")
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true });

  const sortedLines = lines ?? [];

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
            {invoice.customer_name ?? "Client"} ·{" "}
            {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((invoice.grand_total ?? 0) / 100)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/quotes/${invoice.quote_id}`} className="text-sm text-primary underline-offset-4 hover:underline">
            Voir le devis d’origine
          </Link>
          <Link href="/app/invoices" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Factures
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Éditer la facture</CardTitle>
          <CardDescription>Numéro, statut et notes. Les lignes sont issues du devis (tu peux les retrouver sur le devis).</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateInvoice} className="space-y-6">
            <input type="hidden" name="invoice_id" value={invoiceId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invoice_number">Numéro de facture</Label>
                <Input id="invoice_number" name="invoice_number" defaultValue={invoice.invoice_number ?? ""} placeholder="FAC-…" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Statut</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={invoice.status ?? "draft"}
                  className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                >
                  <option value="draft">Brouillon</option>
                  <option value="sent">Envoyée</option>
                  <option value="paid">Payée</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" defaultValue={invoice.notes ?? ""} rows={4} />
            </div>
            <Button type="submit">Enregistrer</Button>
          </form>
        </CardContent>
      </Card>

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
