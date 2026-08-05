import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseMissing } from "@/components/supabase-missing";

import { InscriptionClientForm } from "./inscription-client-form";

function safeInternalPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}

export default async function InscriptionClientPage({
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
  const next = safeInternalPath(typeof sp.next === "string" ? sp.next : "/compte");
  const success = typeof sp.success === "string" ? sp.success : undefined;
  const pendingAppointmentId = typeof sp.pending === "string" ? sp.pending : null;
  const prefillEmail = typeof sp.email === "string" ? sp.email : "";
  const inviteToken = typeof sp.invite === "string" ? sp.invite : undefined;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto flex min-h-screen max-w-lg items-center px-6 py-16">
        <div className="w-full space-y-6">
          <div className="text-center">
            <p className="text-sm font-medium text-primary">Compte client</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Créer un compte</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pour échanger avec les artisans et prendre rendez-vous sur leurs pages — sans espace pro.
            </p>
          </div>

          {success === "check_email" && (
            <Alert>
              <AlertTitle>Vérifie tes emails</AlertTitle>
              <AlertDescription>
                Confirme ton compte si demandé, puis reviens sur la page de l’artisan.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Inscription</CardTitle>
              <CardDescription>Adresse e-mail, mot de passe et prénom ou pseudo affiché.</CardDescription>
            </CardHeader>
            <CardContent>
              <InscriptionClientForm
                next={next}
                pendingAppointmentId={pendingAppointmentId}
                prefillEmail={prefillEmail || undefined}
                inviteToken={inviteToken}
              />
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground">
            Déjà un compte ?{" "}
            <Link
              className="font-medium text-primary underline-offset-4 hover:underline"
              href={`/login?next=${encodeURIComponent(next)}`}
            >
              Se connecter
            </Link>
            {" · "}
            <Link className="underline-offset-4 hover:underline" href="/">
              Accueil
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
