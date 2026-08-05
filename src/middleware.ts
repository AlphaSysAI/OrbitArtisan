import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Permet de lancer l'app sans config Supabase (landing + démo).
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

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

  const pathname = request.nextUrl.pathname;
  const needsAuth =
    pathname.startsWith("/app") || pathname.startsWith("/mes-devis") || pathname.startsWith("/compte");

  if (needsAuth) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }

    const { data: artisanProfile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
    const isArtisan = !!artisanProfile;

    const { data: customerProfile } = await supabase.from("customer_profiles").select("id").eq("user_id", user.id).maybeSingle();
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
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js$|manifest\\.webmanifest$|pwa-icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

