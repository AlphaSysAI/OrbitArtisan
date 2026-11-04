import { safeNextPath } from "@/lib/auth/safe-next";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { buildAuthLinkFailurePath } from "@/lib/auth/email-confirmation";
import { persistRegistrationIpOnProfile } from "@/lib/auth/persist-registration-ip";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next");
  const next = safeNextPath(rawNext, "/app");
  const email = url.searchParams.get("email");
  // Lien refusé par Supabase (expiré, déjà utilisé) : renvoyé en query string.
  const linkError = url.searchParams.get("error_code") ?? url.searchParams.get("error");

  const toLogin = (error?: string | null) =>
    NextResponse.redirect(new URL(buildAuthLinkFailurePath({ next: rawNext, email, linkError: error }), url.origin));

  if (!code) return toLogin(linkError);

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
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !sessionData.user) {
    // Cas typique : mail ouvert sur un autre appareil (pas de code verifier PKCE ici).
    // L'adresse est déjà confirmée par Supabase : on ouvre la connexion, e-mail prérempli.
    return toLogin(null);
  }

  await persistRegistrationIpOnProfile(supabase, sessionData.user);
  return response;
}
