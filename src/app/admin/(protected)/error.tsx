"use client";

import { AdminSetupAlert } from "@/components/admin/admin-setup-alert";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const missingServiceRole =
    error.message.includes("SUPABASE_SERVICE_ROLE_KEY") || error.message.includes("ADMIN_MISSING_SERVICE_ROLE");

  return (
    <div className="space-y-6">
      {missingServiceRole ? (
        <AdminSetupAlert issue="missing_service_role" />
      ) : (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
          <h1 className="font-display text-xl font-semibold tracking-tight">Erreur espace Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Une exception serveur s&apos;est produite. Vérifie la migration SQL et les variables Vercel.
          </p>
          {process.env.NODE_ENV === "development" ? (
            <pre className="mt-4 overflow-x-auto rounded-lg bg-muted p-3 text-xs">{error.message}</pre>
          ) : null}
        </div>
      )}
      <Button type="button" variant="outline" onClick={reset}>
        Réessayer
      </Button>
    </div>
  );
}
