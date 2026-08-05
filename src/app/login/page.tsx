import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseMissing } from "@/components/supabase-missing";

import { signInWithPassword, signUpWithPassword } from "./actions";

type Role = "artisan" | "particulier";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="container mx-auto max-w-xl px-6 py-16">
        <SupabaseMissing title="Connexion indisponible" showLoginLink={false} />
      </div>
    );
  }

  const sp = await searchParams;
  const role: Role = sp.role === "particulier" ? "particulier" : "artisan";
  const isParticulier = role === "particulier";
  const next = typeof sp.next === "string" ? sp.next : isParticulier ? "/compte" : "/app";
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const success = typeof sp.success === "string" ? sp.success : undefined;
  const prefillEmail = typeof sp.email === "string" ? sp.email : "";
  const inviteToken = typeof sp.invite === "string" ? sp.invite : "";
  const info = typeof sp.info === "string" ? sp.info : undefined;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  return (
    <div className="min-h-[calc(100vh-0px)] bg-background">
      <div className="container mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
        <div className="w-full space-y-6">
          <div className="space-y-2 text-center">
            <p className="text-sm text-muted-foreground">Orbit Artisan</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {isParticulier ? "Espace client" : "Espace artisan"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isParticulier
                ? "Vos devis, vos factures et vos échanges avec votre artisan."
                : "Vos devis, vos factures, votre planning et votre site vitrine."}
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Impossible de se connecter</AlertTitle>
              <AlertDescription>
                {error === "invalid_credentials"
                  ? "Adresse e-mail ou mot de passe invalide."
                  : "Une erreur est survenue. Réessaie."}
              </AlertDescription>
            </Alert>
          )}

          {success === "check_email" && (
            <Alert>
              <AlertTitle>Inscription créée</AlertTitle>
              <AlertDescription>
                Vérifie tes emails pour confirmer ton compte si nécessaire.
              </AlertDescription>
            </Alert>
          )}

          {info === "rdv_enregistre" && (
            <Alert>
              <AlertTitle>Demande de RDV enregistrée</AlertTitle>
              <AlertDescription>
                Connecte-toi avec cette adresse e-mail pour retrouver ton rendez-vous dans ton espace client.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Se connecter</CardTitle>
              <CardDescription>Avec adresse e-mail et mot de passe (simple pour démarrer).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form action={signInWithPassword} className="space-y-4">
                <input type="hidden" name="next" value={next} />
                <input type="hidden" name="role" value={role} />
                <div className="space-y-2">
                  <Label htmlFor="email">Adresse e-mail</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="toi@entreprise.fr"
                    autoComplete="email"
                    required
                    defaultValue={prefillEmail}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <Button className="w-full" type="submit">
                  Connexion
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              {isParticulier ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    Pas encore de compte client ?
                  </p>
                  <Link
                    className={buttonVariants({ variant: "secondary", className: "w-full" })}
                    href={`/inscription-client?next=${encodeURIComponent(next)}${
                      inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ""
                    }`}
                  >
                    Créer mon compte client
                  </Link>
                </div>
              ) : (
                <form action={signUpWithPassword} className="space-y-4">
                  <input type="hidden" name="next" value={next} />
                  {inviteToken ? <input type="hidden" name="invite" value={inviteToken} /> : null}
                  <div className="space-y-2">
                    <Label htmlFor="email2">Créer un compte artisan</Label>
                    <Input
                      id="email2"
                      name="email"
                      type="email"
                      placeholder="toi@entreprise.fr"
                      autoComplete="email"
                      required
                      defaultValue={prefillEmail}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password2">Mot de passe</Label>
                    <Input
                      id="password2"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum 8 caractères. Tu pourras activer des options plus avancées plus tard.
                    </p>
                  </div>
                  <Button className="w-full" variant="secondary" type="submit">
                    Créer mon compte
                  </Button>
                </form>
              )}

              <p className="text-center text-sm text-muted-foreground">
                <Link className="text-foreground underline-offset-4 hover:underline" href="/">
                  Retour au choix du profil
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

