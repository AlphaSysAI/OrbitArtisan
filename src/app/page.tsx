import type { Metadata } from "next";

import { SolineBtpLanding } from "@/components/landing/soline-btp-landing";

export const metadata: Metadata = {
  title: "Soline — Secrétariat IA & Gestion pour artisans du BTP",
  description:
    "Devis en 2 minutes, secrétaire vocale 24/7, paniers matériaux automatiques. Soline simplifie la gestion des artisans du bâtiment.",
  openGraph: {
    title: "Soline — Vos devis pliés en 2 min, 0 appel manqué",
    description:
      "L'assistante digitale qui décroche au téléphone, prépare vos achats matériaux et gère votre administratif BTP.",
    type: "website",
  },
};

export default function Home() {
  return <SolineBtpLanding />;
}
