import { notFound } from "next/navigation";

import { ClipboardList } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { WorkOrderSignatureForm } from "./work-order-signature-form";

type WorkOrderPayload = {
  id: string;
  reference_number: string | null;
  title: string;
  description: string | null;
  client_name: string | null;
  site_address: string | null;
  scheduled_at: string | null;
  status: string;
  work_performed: string | null;
  materials_used: string | null;
  signed_at: string | null;
  client_signature_name: string | null;
  artisan: {
    business_name: string;
    name: string | null;
    phone: string | null;
    logo_url: string | null;
  };
};

export default async function PublicWorkOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Bon d'intervention indisponible" />;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("work_order_by_public_token", { p_token: token });

  if (error || !data) notFound();

  const wo = data as WorkOrderPayload;
  const isSigned = wo.status === "signed";

  return (
    <div className="mx-auto max-w-lg space-y-8 px-4 py-10">
      <header className="space-y-2 text-center">
        {wo.artisan.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wo.artisan.logo_url} alt="" className="mx-auto h-14 w-auto object-contain" />
        ) : null}
        <p className="text-sm text-muted-foreground">{wo.artisan.business_name}</p>
        <h1 className="flex items-center justify-center gap-2 text-xl font-semibold">
          <ClipboardList className="h-5 w-5" />
          Bon d&apos;intervention
        </h1>
        <p className="text-sm text-muted-foreground">{wo.reference_number}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{wo.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {wo.client_name ? <p>Client : {wo.client_name}</p> : null}
          {wo.site_address ? <p>Chantier : {wo.site_address}</p> : null}
          {wo.description ? <p className="text-muted-foreground">{wo.description}</p> : null}
        </CardContent>
      </Card>

      {isSigned ? (
        <p className="rounded-xl border border-green-600/30 bg-green-500/5 p-4 text-center text-sm">
          Signé par {wo.client_signature_name} le {wo.signed_at ? new Date(wo.signed_at).toLocaleString("fr-FR") : ""}
        </p>
      ) : (
        <WorkOrderSignatureForm token={token} />
      )}
    </div>
  );
}
