import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SupabaseMissing({
  title = "Configurer Supabase",
  showLoginLink = true,
}: {
  title?: string;
  showLoginLink?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Les variables d’environnement Supabase ne sont pas encore définies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-2">
          <p>Crée un fichier <code>.env.local</code> à la racine (ou copie <code>.env.example</code>) :</p>
          <pre className="overflow-x-auto rounded-xl border bg-muted/30 p-3 text-xs">
{`NEXT_PUBLIC_SUPABASE_URL="https://xxxxxxxxxxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="votre-clé-anon-publique"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"`}
          </pre>
          <p>
            Puis exécute le schéma SQL: <code>supabase/schema.sql</code> dans Supabase.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link className={buttonVariants({ variant: "secondary" })} href="/">
            Retour à l’accueil
          </Link>
          {showLoginLink && (
            <Link className={buttonVariants()} href="/login">
              Aller à la connexion
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

