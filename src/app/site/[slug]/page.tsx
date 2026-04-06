import { notFound } from "next/navigation";

import type { VitrineOwnerAppointment } from "@/components/vitrine/vitrine-owner-calendar";
import { VitrinePublicPage } from "@/components/vitrine/vitrine-public-page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveVitrineAccent } from "@/lib/vitrine-theme";

type Profile = {
  id: string;
  user_id: string;
  name: string | null;
  business_name: string;
  description: string | null;
  logo_url: string | null;
  slug: string;
  accent_color: string | null;
};

type Service = {
  id: string;
  title: string;
  duration: number;
  price: number | null;
};

export default async function PublicSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const demoMode = slug === "demo-artisan";

  let profile: Profile | null = null;
  let services: Service[] = [];
  let viewerUserId: string | null = null;
  let isOwner = false;
  let ownerAppointments: VitrineOwnerAppointment[] = [];

  if (demoMode) {
    profile = {
      id: "00000000-0000-0000-0000-000000000000",
      user_id: "00000000-0000-0000-0000-000000000001",
      name: "Léa Fontaine",
      business_name: "Atelier Demo (Plomberie)",
      description:
        "Interventions rapides et soignées. Dépannage, rénovation, entretien — je vous explique tout avant d’intervenir, pour un chantier serein de bout en bout.",
      logo_url: null,
      slug,
      accent_color: null,
    };
    services = [
      { id: "demo-1", title: "Dépannage (visite)", duration: 45, price: 6500 },
      { id: "demo-2", title: "Entretien (installation)", duration: 60, price: 8900 },
      { id: "demo-3", title: "Devis rénovation", duration: 30, price: null },
    ];
  } else {
    const supabase = await createSupabaseServerClient();

    const { data: p } = await supabase
      .from("profiles")
      .select("id, user_id, name, business_name, description, logo_url, slug, accent_color")
      .eq("slug", slug)
      .maybeSingle();

    if (!p) notFound();
    profile = p as Profile;

    const { data: s } = await supabase
      .from("services")
      .select("id, title, duration, price")
      .eq("artisan_id", profile.id)
      .order("title", { ascending: true });

    services = (s ?? []) as Service[];

    const {
      data: { user },
    } = await supabase.auth.getUser();
    viewerUserId = user?.id ?? null;
    isOwner = !!(user && profile.user_id === user.id);

    if (isOwner) {
      const from = new Date();
      from.setMonth(from.getMonth() - 3);
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setMonth(to.getMonth() + 12);
      to.setHours(23, 59, 59, 999);

      const { data: appts } = await supabase
        .from("appointments")
        .select("id, start_time, customer_name, customer_email, status, service_id")
        .eq("artisan_id", profile.id)
        .gte("start_time", from.toISOString())
        .lte("start_time", to.toISOString())
        .order("start_time", { ascending: true });

      ownerAppointments = (appts ?? []) as VitrineOwnerAppointment[];
    }
  }

  const accent = resolveVitrineAccent(profile.accent_color, profile.business_name);

  return (
    <VitrinePublicPage
      profile={profile}
      services={services}
      accent={accent}
      demoMode={demoMode}
      viewerUserId={viewerUserId}
      isOwner={isOwner}
      ownerAppointments={ownerAppointments}
    />
  );
}
