"use client";

import { useSyncExternalStore } from "react";

import { endImpersonation } from "@/app/admin/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ADMIN_IMPERSONATION_COOKIE, type ImpersonationCookie } from "@/lib/auth/impersonation";

function readImpersonationCookie(): ImpersonationCookie | null {
  if (typeof document === "undefined") return null;

  const raw = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${ADMIN_IMPERSONATION_COOKIE}=`))
    ?.split("=")
    .slice(1)
    .join("=");

  if (!raw) return null;

  try {
    return JSON.parse(decodeURIComponent(raw)) as ImpersonationCookie;
  } catch {
    return null;
  }
}

export function ImpersonationBanner() {
  const ctx = useSyncExternalStore(
    () => () => {},
    readImpersonationCookie,
    () => null,
  );

  if (!ctx) return null;

  return (
    <Alert className="mb-6 border-amber-500/50 bg-amber-500/10">
      <AlertTitle>Mode support — impersonation</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Vous consultez le compte de <strong>{ctx.targetLabel}</strong>
          {ctx.readOnly ? " (lecture seule)" : ""}.
        </span>
        <form action={endImpersonation}>
          <Button type="submit" size="sm" variant="outline">
            Quitter l&apos;impersonation
          </Button>
        </form>
      </AlertDescription>
    </Alert>
  );
}
