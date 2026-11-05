import type Stripe from "stripe";

import { getPublicSiteUrl } from "@/lib/site-url";

/**
 * Habillage SolineBTP de la page de paiement Stripe (abonnements, tarif normal et
 * ambassadeur). Pas de `custom_text` : incompatible avec Managed Payments.
 * L'icône doit être une URL finissant par .png/.jpg/.svg.
 */
export function subscriptionCheckoutBranding(): Pick<Stripe.Checkout.SessionCreateParams, "branding_settings"> {
  return {
    branding_settings: {
      display_name: "SolineBTP",
      background_color: "#fcfaf4",
      button_color: "#243447",
      border_style: "rounded",
      font_family: "lora",
      icon: { type: "url", url: `${getPublicSiteUrl()}/brand/solinebtp-icon.png` },
    },
  };
}
