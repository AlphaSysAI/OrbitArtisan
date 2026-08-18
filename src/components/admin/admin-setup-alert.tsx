import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AdminSetupIssue } from "@/lib/admin/db";

export function AdminSetupAlert({ issue }: { issue: AdminSetupIssue }) {
  if (issue === "missing_service_role") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Configuration serveur incomplète</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            La variable <code className="text-xs">SUPABASE_SERVICE_ROLE_KEY</code> n&apos;est pas définie sur
            Vercel. L&apos;espace Admin en a besoin pour lire les données cross-tenant.
          </p>
          <p className="text-sm">
            Ajoute-la dans <strong>Vercel → Project → Settings → Environment Variables</strong> (même valeur que
            dans Supabase → Project Settings → API → service_role), puis redéploie.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTitle>Migration base de données requise</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          Exécute les scripts SQL suivants dans l&apos;éditeur Supabase, dans l&apos;ordre si besoin :
        </p>
        <ul className="list-inside list-disc text-sm">
          <li>
            <code className="text-xs">supabase/migration/01_voice_quota.sql</code>
          </li>
          <li>
            <code className="text-xs">supabase/migration/02_platform_admin.sql</code>
          </li>
        </ul>
        <p className="text-sm">
          Puis promouvois ton compte :{" "}
          <code className="text-xs">insert into platform_admins (user_id) values (&apos;…&apos;);</code>
        </p>
        <Link href="/admin/forbidden" className="text-sm underline underline-offset-4">
          Documentation accès admin
        </Link>
      </AlertDescription>
    </Alert>
  );
}
