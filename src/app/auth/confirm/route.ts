import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { buildAuthLinkFailurePath, NEW_PASSWORD_PATH, parseEmailOtpType } from "@/lib/auth/email-confirmation";
import { safeNextPath } from "@/lib/auth/safe-next";

/**
 * Lien d'e-mail au format `token_hash` (templates Supabase personnalisés).
 * Contrairement au flux PKCE de /auth/callback, il ouvre la session sur n'importe quel
 * appareil : indispensable pour « mot de passe oublié » demandé sur PC et ouvert sur mobile.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = parseEmailOtpType(url.searchParams.get("type"));
  const rawNext = type === "recovery" ? NEW_PASSWORD_PATH : url.searchParams.get("next");
  const next = safeNextPath(rawNext, "/app");
  const email = url.searchParams.get("email");

  const fail = (linkError: string) =>
    NextResponse.redirect(new URL(buildAuthLinkFailurePath({ next: rawNext, email, linkError }), url.origin));

  if (!tokenHash || !type) return fail("link_invalid");

  const response = NextResponse.redirect(new URL(next, url.origin));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    if (error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500) {
      return fail("auth_unavailable");
    }
    const expired = error.code === "otp_expired";
    return fail(expired ? "otp_expired" : "link_invalid");
  }

  return response;
}
