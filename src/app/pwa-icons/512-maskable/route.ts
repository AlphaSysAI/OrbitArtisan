import { NextResponse } from "next/server";

/** Ancienne adresse d'icône (PWA déjà installées, application Android) : renvoie vers le logo. */
export function GET(request: Request) {
  return NextResponse.redirect(new URL("/brand/soline-logo-512.png", request.url), 308);
}
