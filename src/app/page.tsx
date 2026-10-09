import type { Metadata } from "next";

import { SolineBtpLanding } from "@/components/landing/soline-btp-landing";
import { getMarketingSiteUrl, getPublicSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  metadataBase: new URL(getMarketingSiteUrl()),
  title: "Soline — Le secrétariat téléphonique des artisans du bâtiment",
  description:
    "Quand vous ne pouvez pas décrocher, Soline répond à vos clients, note la demande et propose un créneau que vous validez. Vous gardez votre numéro. Devis, factures et relances dans la même application.",
  openGraph: {
    title: "Sur le chantier, vous travaillez. Soline répond à vos clients.",
    description:
      "Secrétariat téléphonique pour artisans : vous gardez votre numéro, vous validez chaque rendez-vous. Devis, factures, suivi de chantier et relances inclus.",
    type: "website",
  },
};

export default function Home() {
  const appUrl = getPublicSiteUrl();

  return <SolineBtpLanding appLoginUrl={`${appUrl}/login?role=artisan`} registerUrl={`${appUrl}/register`} />;
}
