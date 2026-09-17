import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMissing } from "@/components/supabase-missing";
import { formatContactDisplayName } from "@/lib/contacts/display-name";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveVitrineAccent } from "@/lib/vitrine-theme";

import { QuoteForm } from "../../quote-form";

export default async function EditQuotePage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Devis indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, slug, accent_color, labor_rate_per_hour")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!profile?.id) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Devis</h1>
        <p className="text-sm text-muted-foreground">Renseigne d’abord ton activité.</p>
        <Link href="/app/reglages?tab=activite" className={buttonVariants({ variant: "outline" })}>
          Mon activité
        </Link>
      </div>
    );
  }

  const { data: quote } = await supabase
    .from("quotes")
    .select(
      "id, artisan_id, status, customer_name, customer_email, customer_user_id, conversation_id, notes, labor_duration_minutes, reduced_vat_rate, generate_vat_attestation, work_site_address, work_site_city, work_site_postal_code, retraction_waived",
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (!quote || quote.artisan_id !== profile.id) notFound();

  if (quote.status !== "draft") {
    return (
      <Card className="border-0 shadow-none">
        <CardHeader>
          <CardTitle>Devis non modifiable</CardTitle>
          <CardDescription>
            Ce devis a déjà été envoyé — seul un brouillon peut être modifié. Utilise « Dupliquer pour modifier »
            depuis sa fiche pour repartir d’une copie.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={`/app/quotes/${quoteId}`} className={buttonVariants({ variant: "outline" })}>
            Retour au devis
          </Link>
        </CardContent>
      </Card>
    );
  }

  const { data: services } = await supabase
    .from("services")
    .select("id, title, duration, price")
    .eq("artisan_id", profile.id)
    .order("title", { ascending: true });

  const accent = resolveVitrineAccent(profile.accent_color, profile.business_name);

  const safeServices = (services ?? []) as {
    id: string;
    title: string;
    duration: number;
    price: number | null;
  }[];

  const [{ data: serviceLines }, { data: materialLines }] = await Promise.all([
    supabase
      .from("quote_services")
      .select("service_id")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true }),
    supabase
      .from("quote_materials")
      .select("label, quantity, unit_price, vat_rate, exclude_from_invoice")
      .eq("quote_id", quoteId)
      .order("created_at", { ascending: true }),
  ]);

  let conversationPrefill: {
    conversationId: string;
    customerUserId?: string | null;
    customerName: string;
    customerEmail: string;
  } | null = null;

  if (quote.conversation_id) {
    conversationPrefill = {
      conversationId: quote.conversation_id,
      customerUserId: quote.customer_user_id,
      customerName: formatContactDisplayName({ name: quote.customer_name, email: quote.customer_email }),
      customerEmail: quote.customer_email ?? "",
    };
  }

  return (
    <QuoteForm
      accentColor={accent}
      profileLaborRatePerHourCents={profile.labor_rate_per_hour ?? null}
      services={safeServices}
      conversationPrefill={conversationPrefill}
      editQuote={{
        id: quote.id,
        customerName: quote.customer_name ?? "",
        customerEmail: quote.customer_email ?? "",
        notes: quote.notes ?? "",
        laborDurationMinutes: quote.labor_duration_minutes ?? 0,
        selectedServiceIds: (serviceLines ?? []).map((s) => s.service_id as string),
        materials: (materialLines ?? []).map((m) => ({
          label: m.label as string,
          quantity: m.quantity as number,
          unitPriceCents: m.unit_price as number,
          vatRate: String(m.vat_rate ?? 20),
          excludeFromInvoice: !!m.exclude_from_invoice,
        })),
        reducedVatRate: quote.reduced_vat_rate != null ? String(quote.reduced_vat_rate) : "20",
        generateVatAttestation: !!quote.generate_vat_attestation,
        workSiteAddress: quote.work_site_address ?? "",
        workSiteCity: quote.work_site_city ?? "",
        workSitePostalCode: quote.work_site_postal_code ?? "",
        retractionWaived: !!quote.retraction_waived,
      }}
    />
  );
}
