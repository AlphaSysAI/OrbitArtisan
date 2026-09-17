import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { PWA_STANDALONE_COOKIE } from "@/lib/pwa/constants";
import {
  getMarketingSiteUrl,
  getPublicSiteOrigin,
  getPublicSiteUrl,
  hostnameFromUrl,
  isDomainSplitEnabled,
} from "@/lib/site-url";

const LEGAL_PATHS = ["/cgu", "/cgv", "/mentions-legales", "/confidentialite"] as const;

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
    return absoluteRedirect(pathname, getPublicSiteOrigin(), search);
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

function resolveAuthenticatedHomePath(isArtisan: boolean): string {
  return isArtisan ? "/app" : "/compte";
}

function resolveUnauthenticatedHomePath(): string {
  return "/login?role=artisan";
}

/** Racine `/` en PWA ou sur le domaine app : dashboard ou connexion, jamais la landing. */
export function resolvePwaOrAppRootRedirect(
  request: NextRequest,
  isAuthenticated: boolean,
  isArtisan: boolean,
): NextResponse | null {
  if (request.nextUrl.pathname !== "/") return null;

  const pwaStandalone = request.cookies.get(PWA_STANDALONE_COOKIE)?.value === "1";

  const host = requestHostname(request);
  const appHost = hostnameFromUrl(getPublicSiteUrl());
  const onAppHost = Boolean(appHost && host === appHost);
  const domainSplitAppRoot = isDomainSplitEnabled() && onAppHost;

  if (!pwaStandalone && !domainSplitAppRoot) return null;

  const origin = onAppHost ? getPublicSiteOrigin() : request.nextUrl.origin;
  if (isAuthenticated) {
    return absoluteRedirect(resolveAuthenticatedHomePath(isArtisan), origin);
  }
  return absoluteRedirect(resolveUnauthenticatedHomePath(), origin);
}

/** @deprecated Utiliser resolvePwaOrAppRootRedirect */
export function resolveAppRootRedirect(
  request: NextRequest,
  isAuthenticated: boolean,
  isArtisan: boolean,
): NextResponse | null {
  return resolvePwaOrAppRootRedirect(request, isAuthenticated, isArtisan);
}
