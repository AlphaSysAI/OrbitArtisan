import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { type ArtisanAppointment } from "./actions";
import { RdvCalendar } from "./rdv-calendar";

export default async function ArtisanRdvPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Rendez-vous indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/rdv");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();

  if (!profile?.id) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mes rendez-vous</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profil artisan requis</CardTitle>
            <CardDescription>
              Configure ton activité dans les réglages pour recevoir des demandes de rendez-vous.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { data: rows } = await supabase
    .from("appointments")
    .select("id, start_time, status, customer_name, customer_email, customer_phone, service_id, customer_user_id")
    .eq("artisan_id", profile.id)
    .order("start_time", { ascending: true });

  const { data: services } = await supabase
    .from("services")
    .select("id, title")
    .eq("artisan_id", profile.id);

  type Row = ArtisanAppointment & { customer_user_id: string | null };
  const raw = (rows ?? []) as Row[];

  // Repli téléphone : un RDV sans numéro (invité, ancienne réservation) peut
  // hériter du téléphone renseigné par le client dans ses réglages de compte.
  const missingPhoneUserIds = [
    ...new Set(raw.filter((r) => !r.customer_phone && r.customer_user_id).map((r) => r.customer_user_id as string)),
  ];

  const phoneByUserId = new Map<string, string>();
  if (missingPhoneUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("customer_profiles")
      .select("user_id, phone")
      .in("user_id", missingPhoneUserIds);
    for (const p of profiles ?? []) {
      if (p.phone) phoneByUserId.set(p.user_id, p.phone);
    }
  }

  const appointments: ArtisanAppointment[] = raw.map((r) => ({
    id: r.id,
    start_time: r.start_time,
    status: r.status,
    customer_name: r.customer_name,
    customer_email: r.customer_email,
    customer_phone: r.customer_phone ?? (r.customer_user_id ? phoneByUserId.get(r.customer_user_id) ?? null : null),
    service_id: r.service_id,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <CalendarClock className="h-6 w-6" />
          Mes rendez-vous
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Valide ou refuse les demandes reçues depuis ta page vitrine.
        </p>
      </div>

      {appointments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarClock className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 max-w-sm text-muted-foreground">
              Aucune demande pour l’instant. Les rendez-vous réservés sur ta page vitrine apparaîtront ici.
            </p>
          </CardContent>
        </Card>
      ) : (
        <RdvCalendar appointments={appointments} services={services ?? []} />
      )}
    </div>
  );
}
