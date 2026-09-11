import type { Metadata } from "next";

import { SolineBtpLanding } from "@/components/landing/soline-btp-landing";
import { getMarketingSiteUrl, getPublicSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  metadataBase: new URL(getMarketingSiteUrl()),
  title: "Soline — Secrétariat IA & Gestion pour artisans du BTP",
  description:
    "Devis en 2 minutes, secrétaire vocale 24/7, paniers matériaux automatiques et recouvrement d'impayés (mise en demeure en recommandé). Soline simplifie la gestion des artisans du bâtiment.",
  openGraph: {
    title: "Soline — Vos devis pliés en 2 min, 0 appel manqué",
    description:
      "L'assistante digitale qui décroche au téléphone, prépare vos achats matériaux, gère votre administratif BTP et recouvre vos impayés.",
    type: "website",
  },
};

export default function Home() {
  const appUrl = getPublicSiteUrl();
  const artisanAuthUrl = `${appUrl}/register`;

  return (
    <SolineBtpLanding appLoginUrl={`${appUrl}/login?role=artisan`} appRegisterUrl={artisanAuthUrl} />
  );
}
