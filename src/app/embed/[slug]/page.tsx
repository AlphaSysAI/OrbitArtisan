import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { SupabaseMissing } from "@/components/supabase-missing";
import { parseEmbedTheme } from "@/lib/leads/embed";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { presetTradeFromProfile } from "@/lib/trades/preset-from-profile";

import { EstimationWizard } from "@/app/estimation/estimation-wizard";

import { EmbedFrame } from "./embed-frame";

export const metadata: Metadata = {
  title: "Demander une estimation",
  robots: { index: false, follow: false },
};

type EmbedProfile = {
  id: string;
  business_name: string;
  logo_url: string | null;
  slug: string;
  trade_category: string | null;
  trade: string | null;
};

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ theme?: string | string[] }>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Widget indisponible" />;
  }

  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const theme = parseEmbedTheme(sp.theme);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("artisan_public_profiles")
    .select("id, business_name, logo_url, slug, trade_category, trade")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) notFound();
  const profile = data as EmbedProfile;
  const presetTrade = presetTradeFromProfile(profile.trade_category, profile.trade);

  return (
    <EmbedFrame
      theme={theme}
      header={
        <div className="flex min-w-0 items-center gap-2.5">
          {profile.logo_url ? (
            <Image
              src={profile.logo_url}
              alt=""
              width={32}
              height={32}
              unoptimized
              className="size-8 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
              {profile.business_name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{profile.business_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {presetTrade ? `${presetTrade.tradeLabel} · estimation gratuite` : "Estimation gratuite"}
            </p>
          </div>
        </div>
      }
    >
      <EstimationWizard
        originArtisanSlug={profile.slug}
        presetTrade={presetTrade}
        owner={{ slug: profile.slug, businessName: profile.business_name }}
        compact
      />
    </EmbedFrame>
  );
}
