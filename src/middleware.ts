import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { resolveAppRootRedirect, resolveDomainRouting } from "@/lib/domain-routing";

export async function middleware(request: NextRequest) {
  const domainRedirect = resolveDomainRouting(request);
  if (domainRedirect) return domainRedirect;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Permet de lancer l'app sans config Supabase (landing + démo).
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isArtisan = false;
  if (user) {
    const { data: artisanProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    isArtisan = !!artisanProfile;
  }

  const appRootRedirect = resolveAppRootRedirect(request, !!user, isArtisan);
  if (appRootRedirect) return appRootRedirect;

  const pathname = request.nextUrl.pathname;

  let isSuperAdmin = false;
  if (user) {
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

    const { data: customerProfile } = await supabase
      .from("customer_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    const isClientOnly = !!customerProfile && !isArtisan;

    if (isClientOnly && pathname.startsWith("/app")) {
      const url = request.nextUrl.clone();
      url.pathname = "/compte";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (isArtisan && pathname.startsWith("/compte")) {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (isArtisan && pathname.startsWith("/app") && !isSuperAdmin && pathname !== "/app/suspended") {
      const { data: artisanProfile } = await supabase
        .from("profiles")
        .select("account_status, deleted_at, subscription_status, trial_ends_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (
        artisanProfile?.account_status === "suspended" ||
        artisanProfile?.deleted_at
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/app/suspended";
        url.search = "";
        return NextResponse.redirect(url);
      }

      const { evaluateSubscriptionAccess, isSubscriptionDocumentBlockedPath, subscriptionBlockRedirectReason } =
        await import("@/lib/billing/subscription-access");

      const access = evaluateSubscriptionAccess(artisanProfile ?? null);
      if (
        !access.allowed &&
        isSubscriptionDocumentBlockedPath(pathname) &&
        !pathname.startsWith("/app/abonnement")
      ) {
        const url = request.nextUrl.clone();
        url.pathname = "/app/abonnement";
        url.search = `?reason=${subscriptionBlockRedirectReason(access.reason ?? "trial_expired")}`;
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js$|manifest\\.webmanifest$|pwa-icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
