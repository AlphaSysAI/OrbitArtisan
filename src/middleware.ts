import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { resolveAppRootRedirect, resolveDomainRouting } from "@/lib/domain-routing";
import {
  evaluateSubscriptionAccess,
  isSubscriptionDocumentBlockedPath,
  subscriptionBlockRedirectReason,
} from "@/lib/billing/subscription-access";

export async function middleware(request: NextRequest) {
  const domainRedirect = resolveDomainRouting(request);
  if (domainRedirect) return domainRedirect;

  const pathname = request.nextUrl.pathname;

  // Accès public devis / factures retiré — documents via espace client authentifié uniquement.
  if (pathname.startsWith("/devis/") || pathname.startsWith("/facture/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Permet de lancer l'app sans config Supabase (landing + démo).
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  const response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let artisanProfile: {
    id: string;
    account_status: string | null;
    deleted_at: string | null;
    subscription_status: string | null;
    trial_ends_at: string | null;
  } | null = null;

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("id, account_status, deleted_at, subscription_status, trial_ends_at")
      .eq("user_id", user.id)
      .maybeSingle();
    artisanProfile = data;
  }

  const isArtisan = !!artisanProfile?.id;

  const appRootRedirect = resolveAppRootRedirect(request, !!user, isArtisan);
  if (appRootRedirect) return appRootRedirect;

  let isSuperAdmin = false;
  if (user && pathname.startsWith("/admin")) {
    const { data: platformAdmin } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    isSuperAdmin = !!platformAdmin?.user_id;
  }

  if (pathname.startsWith("/admin")) {
    if (pathname.startsWith("/admin/forbidden")) {
      return response;
    }
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
    if (!isSuperAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/forbidden";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return response;
  }

  const needsAuth =
    pathname.startsWith("/app") || pathname.startsWith("/mes-devis") || pathname.startsWith("/compte");

  if (needsAuth) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }

    if (!isArtisan && pathname.startsWith("/app")) {
      const { data: customerProfile } = await supabase
        .from("customer_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (customerProfile) {
        const url = request.nextUrl.clone();
        url.pathname = "/compte";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }

    if (isArtisan && pathname.startsWith("/compte")) {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (isArtisan && pathname.startsWith("/app") && !isSuperAdmin && pathname !== "/app/suspended") {
      if (artisanProfile?.account_status === "suspended" || artisanProfile?.deleted_at) {
        const url = request.nextUrl.clone();
        url.pathname = "/app/suspended";
        url.search = "";
        return NextResponse.redirect(url);
      }

      if (isSubscriptionDocumentBlockedPath(pathname)) {
        const access = evaluateSubscriptionAccess(artisanProfile);
        if (!access.allowed) {
          const url = request.nextUrl.clone();
          url.pathname = "/app/reglages";
          url.search = `?tab=abonnement&reason=${subscriptionBlockRedirectReason(access.reason ?? "trial_expired")}`;
          return NextResponse.redirect(url);
        }
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js$|manifest\\.webmanifest$|pwa-icons/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
