import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";

import { AppEmptyState } from "@/components/app/app-empty-state";
import { AppPageHeader } from "@/components/app/app-page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { SupabaseMissing } from "@/components/supabase-missing";
import { listArtisanContacts } from "@/lib/contacts/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { type ArtisanAppointment } from "./actions";
import { NewAppointmentDialog, type AppointmentContactOption } from "./new-appointment-dialog";
import { RdvCalendar } from "./rdv-calendar";

type RdvSearchParams = {
  date?: string;
  /** Ouvre le formulaire de création (assistant IA ou lien direct) */
  new?: string;
  name?: string;
  email?: string;
  phone?: string;
  /** "YYYY-MM-DDTHH:mm" */
  start?: string;
  service?: string;
  ai?: string;
};

export default async function ArtisanRdvPage({
  searchParams,
}: {
  searchParams: Promise<RdvSearchParams>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Rendez-vous indisponibles" />;
  }

  const sp = await searchParams;
  const dateParam =
    typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
  const openCreate = sp.new === "1";
  const startParam =
    typeof sp.start === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(sp.start)
      ? sp.start
      : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/rdv");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();

  if (!profile?.id) {
    return (
      <div className="space-y-8">
        <AppPageHeader eyebrow="Planning" title="Mes rendez-vous" />
        <AppEmptyState
          icon={CalendarClock}
          title="Profil artisan requis"
          description="Configure ton activité dans les réglages pour recevoir des demandes de rendez-vous."
          action={
            <Link href="/app/reglages?tab=activite" className={buttonVariants({ size: "lg" })}>
              Ouvrir les réglages
            </Link>
          }
        />
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

  const contactsRes = await listArtisanContacts();
  const contactOptions: AppointmentContactOption[] = contactsRes.ok
    ? contactsRes.items
        .filter((i) => i.kind === "linked")
        .map((i) => ({ label: i.label, email: i.email }))
    : [];

  const createDialog = (
    <NewAppointmentDialog
      contacts={contactOptions}
      services={services ?? []}
      openOnMount={openCreate}
      prefill={
        openCreate
          ? {
              name: typeof sp.name === "string" ? sp.name : null,
              email: typeof sp.email === "string" ? sp.email : null,
              phone: typeof sp.phone === "string" ? sp.phone : null,
              start: startParam,
              serviceId: typeof sp.service === "string" ? sp.service : null,
              fromAssistant: sp.ai === "1",
            }
          : undefined
      }
    />
  );

  return (
    <div className="space-y-8">
      <AppPageHeader
        eyebrow="Planning"
        title="Mes rendez-vous"
        description="Valide les demandes reçues depuis ta vitrine, ou ajoute un rendez-vous toi-même."
        action={createDialog}
      />

      {appointments.length === 0 ? (
        <AppEmptyState
          icon={CalendarClock}
          title="Aucun rendez-vous pour l’instant"
          description="Les rendez-vous réservés sur ta page vitrine apparaîtront ici. Tu peux aussi en créer un directement."
        />
      ) : (
        <div className="app-surface p-4 sm:p-6">
          <RdvCalendar
            appointments={appointments}
            services={services ?? []}
            initialDateIso={dateParam}
          />
        </div>
      )}
    </div>
  );
}
