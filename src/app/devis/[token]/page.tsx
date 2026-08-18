import Link from "next/link";
import { notFound } from "next/navigation";

import { FileText } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { quoteStatusLabel } from "@/lib/status-labels";

import { PublicQuoteActions } from "./public-quote-actions";

type QuotePayload = {
  id: string;
  status: string;
  customer_name: string | null;
  labor_total: number;
  materials_total: number;
  grand_total: number;
  notes: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  rejected_at: string | null;
  created_at: string;
  artisan: {
    business_name: string;
    name: string | null;
    phone: string | null;
    logo_url: string | null;
    slug: string | null;
  };
  services: { service_title: string; duration_minutes: number; unit_price: number; line_total: number }[];
  materials: { label: string; quantity: number; unit_price: number; line_total: number }[];
};

function formatEur(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Devis indisponible" />;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("quote_by_public_token", { p_token: token });

  if (error || !data) notFound();

  const quote = data as QuotePayload;
  const canAccept = quote.status === "sent" || quote.status === "draft";

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <header className="space-y-2 text-center">
        {quote.artisan.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={quote.artisan.logo_url} alt="" className="mx-auto h-16 w-auto object-contain" />
        ) : null}
        <p className="text-sm text-muted-foreground">{quote.artisan.business_name}</p>
        <h1 className="flex items-center justify-center gap-2 text-2xl font-semibold">
          <FileText className="h-6 w-6" />
          Devis
        </h1>
        <p className="text-sm text-muted-foreground">
          {quote.customer_name ?? "Client"} · {quoteStatusLabel(quote.status)}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Prestations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {quote.services.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune prestation.</p>
          ) : (
            quote.services.map((s, i) => (
              <div key={i} className="flex justify-between gap-4 text-sm">
                <span>
                  {s.service_title} <span className="text-muted-foreground">({s.duration_minutes} min)</span>
                </span>
                <span className="font-medium">{formatEur(s.line_total ?? s.unit_price ?? 0)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fournitures</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {quote.materials.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune fourniture.</p>
          ) : (
            quote.materials.map((m, i) => (
              <div key={i} className="flex justify-between gap-4 text-sm">
                <span>
                  {m.label} <span className="text-muted-foreground">× {m.quantity}</span>
                </span>
                <span className="font-medium">{formatEur(m.line_total ?? 0)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <div className="flex justify-between text-sm">
            <span>Main d&apos;œuvre</span>
            <span>{formatEur(quote.labor_total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Fournitures</span>
            <span>{formatEur(quote.materials_total)}</span>
          </div>
          <div className="flex justify-between border-t pt-3 text-lg font-semibold">
            <span>Total</span>
            <span>{formatEur(quote.grand_total)}</span>
          </div>
        </CardContent>
      </Card>

      {quote.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{quote.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      {quote.status === "accepted" && quote.signed_at ? (
        <p className="rounded-xl border border-green-600/30 bg-green-500/5 p-4 text-center text-sm">
          Accepté par {quote.signed_by_name} le {new Date(quote.signed_at).toLocaleString("fr-FR")}
        </p>
      ) : null}

      {canAccept ? <PublicQuoteActions token={token} /> : null}

      {quote.artisan.slug ? (
        <p className="text-center text-xs text-muted-foreground">
          <Link href={`/site/${quote.artisan.slug}`} className="underline underline-offset-4">
            Vitrine {quote.artisan.business_name}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
