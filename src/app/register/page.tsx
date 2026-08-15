import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMarketingHomeHref } from "@/lib/site-url";
import { SupabaseMissing } from "@/components/supabase-missing";

import { RegisterForm } from "./register-form";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="container mx-auto max-w-xl px-6 py-16">
        <SupabaseMissing title="Inscription indisponible" showLoginLink={false} />
      </div>
    );
  }

  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/app";
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const prefillEmail = typeof sp.email === "string" ? sp.email : "";
  const inviteToken = typeof sp.invite === "string" ? sp.invite : "";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  const loginHref = `/login?role=artisan&next=${encodeURIComponent(next)}${
    inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ""
  }${prefillEmail ? `&email=${encodeURIComponent(prefillEmail)}` : ""}`;

  return (
    <div className="min-h-[calc(100vh-0px)] bg-background">
      <div className="container mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
        <div className="w-full space-y-6">
          <div className="space-y-2 text-center">
            <p className="text-sm text-muted-foreground">Soline</p>
            <h1 className="text-2xl font-semibold tracking-tight">Créer un compte artisan</h1>
            <p className="text-sm text-muted-foreground">
              Devis, factures, planning et site vitrine — tout en un seul endroit.
            </p>
          </div>

          {error === "password_mismatch" && (
            <Alert variant="destructive">
              <AlertTitle>Mots de passe différents</AlertTitle>
              <AlertDescription>Les deux mots de passe doivent être identiques.</AlertDescription>
            </Alert>
          )}

          {error === "password_too_short" && (
            <Alert variant="destructive">
              <AlertTitle>Mot de passe trop court</AlertTitle>
              <AlertDescription>Utilise au moins 8 caractères.</AlertDescription>
            </Alert>
          )}

          {error === "signup_failed" && (
            <Alert variant="destructive">
              <AlertTitle>Inscription impossible</AlertTitle>
              <AlertDescription>
                Cette adresse est peut-être déjà utilisée, ou une erreur est survenue. Réessaie ou connecte-toi.
              </AlertDescription>
            </Alert>
          )}

          {inviteToken ? (
            <Alert>
              <AlertTitle>Invitation reçue</AlertTitle>
              <AlertDescription>
                Crée ton compte avec l&apos;adresse e-mail invitée pour activer ton espace professionnel.
              </AlertDescription>
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Inscription</CardTitle>
              <CardDescription>Quelques informations pour démarrer ton essai gratuit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RegisterForm next={next} prefillEmail={prefillEmail} inviteToken={inviteToken} />

              <p className="text-center text-sm text-muted-foreground">
                Déjà un compte ?{" "}
                <Link className="font-medium text-foreground underline-offset-4 hover:underline" href={loginHref}>
                  Se connecter
                </Link>
              </p>

              <p className="text-center text-sm text-muted-foreground">
                <Link className="text-foreground underline-offset-4 hover:underline" href={getMarketingHomeHref()}>
                  Retour au site Soline
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
