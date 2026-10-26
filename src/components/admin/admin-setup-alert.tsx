import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AdminSetupIssue } from "@/lib/admin/db";

export function AdminSetupAlert({ issue }: { issue: AdminSetupIssue }) {
  if (issue === "missing_service_role") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Configuration serveur incomplète</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            <code className="text-xs">SUPABASE_SERVICE_ROLE_KEY</code> n&apos;est pas définie : l&apos;admin ne peut pas lire les
            données des comptes.
          </p>
          <p className="text-sm">
            À ajouter dans Vercel › Settings › Environment Variables (valeur : Supabase › Project Settings › API ›
            service_role), puis redéployer.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTitle>Migration de base de données manquante</AlertTitle>
      <AlertDescription>
        Une requête de l&apos;admin a échoué. Vérifier que toutes les migrations de <code className="text-xs">supabase/migration</code> ont été
        appliquées dans l&apos;ordre (détail dans les logs Vercel).
      </AlertDescription>
    </Alert>
  );
}
