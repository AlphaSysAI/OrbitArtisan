import Link from "next/link";

import { AppPageHeader } from "@/components/app/app-page-header";
import { SupabaseMissing } from "@/components/supabase-missing";
import { buttonVariants } from "@/components/ui/button-variants";
import { listWorkCategories, listWorkItems } from "@/lib/work-library/actions";
import { listPlatformCatalogForProfile } from "@/lib/work-library/platform-catalog-actions";
import { isTradeConfigured } from "@/lib/work-library/platform-catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { OuvragesClientShell } from "./ouvrages-client-shell";

export default async function OuvragesPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Bibliothèque indisponible" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, labor_rate_per_hour, trade_category, trade")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!profile?.id) {
    return (
      <div className="space-y-6">
        <AppPageHeader
          title="Bibliothèque d'ouvrages"
          description="Catalogue de prix et prestations pré-chiffrées pour vos devis."
        />
        <div className="rounded-2xl border border-warning/40 bg-warning/5 p-5 text-sm">
          <p className="font-medium">Configure d&apos;abord ton activité dans les réglages.</p>
          <Link href="/app/reglages?tab=activite" className={buttonVariants({ className: "mt-4" })}>
            Mon activité
          </Link>
        </div>
      </div>
    );
  }

  const [itemsRes, categoriesRes, platformRes] = await Promise.all([
    listWorkItems(),
    listWorkCategories(),
    listPlatformCatalogForProfile(),
  ]);
  const hourlyRate = profile.labor_rate_per_hour != null ? profile.labor_rate_per_hour / 100 : 45;

  const tradeConfigured = isTradeConfigured(profile.trade_category, profile.trade);
  const platformItems = platformRes.ok ? platformRes.items : [];
  const platformTradeLabel = platformRes.ok ? platformRes.tradeLabel : null;

  return (
    <div className="space-y-8">
      <AppPageHeader
        title="Bibliothèque d'ouvrages"
        description="Catalogue Soline filtré par métier, plus ta bibliothèque personnelle (import CSV, marges)."
      />

      <OuvragesClientShell
        platformItems={platformItems}
        platformTradeLabel={platformTradeLabel}
        tradeConfigured={tradeConfigured}
        initialItems={itemsRes.ok ? itemsRes.items : []}
        categories={categoriesRes.ok ? categoriesRes.items : []}
        defaultHourlyRateHt={hourlyRate}
      />
    </div>
  );
}
