import { NextResponse } from "next/server";

import { AMBASSADOR_PROGRAM } from "@/lib/billing/promo-program";

/**
 * Cible du QR code des flyers (solinebtp.fr/ambassadeur → app, via le routage de domaines).
 * Pré-remplit le code sur le formulaire d'inscription.
 */
export function GET(request: Request) {
  const url = new URL("/register", request.url);
  url.searchParams.set("code", AMBASSADOR_PROGRAM.code);
  url.searchParams.set("utm_source", "flyer");
  return NextResponse.redirect(url, 307);
}
