import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  getMarketingSiteUrl,
  getPublicSiteUrl,
  hostnameFromUrl,
  isDomainSplitEnabled,
} from "@/lib/site-url";

const LEGAL_PATHS = ["/cgu", "/mentions-legales", "/confidentialite"] as const;

const MARKETING_PATHS = new Set<string>(["/", ...LEGAL_PATHS, "/embed.js"]);

function requestHostname(request: NextRequest): string {
  const fromHeader = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (fromHeader) return fromHeader;
  return request.nextUrl.hostname.toLowerCase();
}

function absoluteRedirect(pathname: string, base: string, search = ""): NextResponse {
  const url = new URL(pathname + search, base);
  return NextResponse.redirect(url, 308);
}

/**
 * Redirections inter-domaines marketing ↔ app.
 * Retourne une Response si une redirection est nécessaire, sinon null.
 */
export function resolveDomainRouting(request: NextRequest): NextResponse | null {
  if (!isDomainSplitEnabled()) return null;

  const host = requestHostname(request);
  const marketingHost = hostnameFromUrl(getMarketingSiteUrl());
  const appHost = hostnameFromUrl(getPublicSiteUrl());
  if (!marketingHost || !appHost) return null;

  const { pathname, search } = request.nextUrl;

  if (host === marketingHost) {
    if (MARKETING_PATHS.has(pathname)) return null;
    return absoluteRedirect(pathname, getPublicSiteUrl(), search);
  }

  if (host === appHost) {
    if ((LEGAL_PATHS as readonly string[]).includes(pathname)) {
      return absoluteRedirect(pathname, getMarketingSiteUrl(), search);
    }
    return null;
  }

  // Preview Vercel, localhost avec host custom, etc.
  return null;
}

/** Racine app : login ou espace selon session. */
export function resolveAppRootRedirect(
  request: NextRequest,
  isAuthenticated: boolean,
  isArtisan: boolean,
): NextResponse | null {
  if (!isDomainSplitEnabled()) return null;
  if (request.nextUrl.pathname !== "/") return null;

  const host = requestHostname(request);
  const appHost = hostnameFromUrl(getPublicSiteUrl());
  if (host !== appHost) return null;

  if (isAuthenticated) {
    return absoluteRedirect(isArtisan ? "/app" : "/compte", getPublicSiteUrl());
  }
  return absoluteRedirect("/login?role=artisan", getPublicSiteUrl());
}
