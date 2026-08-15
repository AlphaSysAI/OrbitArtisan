import Link from "next/link";
import { redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SupabaseMissing } from "@/components/supabase-missing";
import { acceptPlatformInvitation, getInvitationByToken } from "@/lib/invitations/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMarketingHomeHref } from "@/lib/site-url";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="container mx-auto max-w-xl px-6 py-16">
        <SupabaseMissing title="Invitation indisponible" showLoginLink={false} />
      </div>
    );
  }

  const { token } = await params;
  const invite = await getInvitationByToken(token);

  if (!invite) {
    return (
      <div className="container mx-auto max-w-lg px-6 py-16">
        <Alert variant="destructive">
          <AlertTitle>Invitation introuvable</AlertTitle>
          <AlertDescription>Ce lien n’est plus valide ou a déjà été utilisé.</AlertDescription>
        </Alert>
        <Link href={getMarketingHomeHref()} className={buttonVariants({ variant: "outline", className: "mt-6 inline-flex" })}>
          Retour à l’accueil
        </Link>
      </div>
    );
  }

  if (invite.expired) {
    return (
      <div className="container mx-auto max-w-lg px-6 py-16">
        <Alert variant="destructive">
          <AlertTitle>Invitation expirée</AlertTitle>
          <AlertDescription>Demande un nouveau lien à {invite.inviterLabel}.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isArtisanInvite = invite.accountType === "artisan";
  const signupUrl = isArtisanInvite
    ? `/register?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(invite.email)}&next=${encodeURIComponent("/app/reglages?tab=activite&success=invite")}`
    : `/inscription-client?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(invite.email)}`;
  const loginUrl = isArtisanInvite
    ? `/login?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(invite.email)}&next=${encodeURIComponent("/app")}`
    : `/login?next=${encodeURIComponent(`/invitation/${token}`)}&email=${encodeURIComponent(invite.email)}`;

  if (user) {
    const accepted = await acceptPlatformInvitation(token);
    if (accepted.ok) {
      redirect(
        accepted.accountType === "artisan" ? "/app/reglages?tab=activite&success=invite" : "/compte/contacts?success=invite",
      );
    }

    const errMsg =
      accepted.error === "email_mismatch"
        ? "Connecte-toi avec l’adresse e-mail qui a reçu l’invitation."
        : accepted.error === "already_client"
          ? "Ce compte est déjà un espace client. Utilise l’inscription client ou une autre adresse e-mail."
          : "Impossible d’accepter l’invitation.";

    return (
      <div className="container mx-auto max-w-lg px-6 py-16">
        <Alert variant="destructive">
          <AlertTitle>Invitation non acceptée</AlertTitle>
          <AlertDescription>{errMsg}</AlertDescription>
        </Alert>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={loginUrl} className={buttonVariants({ variant: "outline" })}>
            Changer de compte
          </Link>
        </div>
      </div>
    );
  }

  const title =
    invite.accountType === "artisan"
      ? "Rejoindre Soline en tant qu’artisan"
      : invite.artisanName
        ? `Compte client — ${invite.artisanName}`
        : "Rejoindre Soline en tant que client";

  const description =
    invite.accountType === "artisan"
      ? `${invite.inviterLabel} vous invite à créer votre espace professionnel (devis, factures, vitrine).`
      : invite.artisanName
        ? `${invite.inviterLabel} vous invite à créer votre compte client pour échanger et suivre vos devis avec ${invite.artisanName}.`
        : `${invite.inviterLabel} vous invite à créer votre compte client sur Soline.`;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto flex min-h-screen max-w-lg items-center px-6 py-16">
        <div className="w-full space-y-6">
          <div className="text-center">
            <p className="text-sm font-medium text-primary">Invitation</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Créer un compte</CardTitle>
              <CardDescription>
                Utilise l’adresse <strong className="font-medium text-foreground">{invite.email}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Link href={signupUrl} className={buttonVariants({ className: "w-full" })}>
                {isArtisanInvite ? "Créer mon compte artisan" : "Créer mon compte client"}
              </Link>
              <Link href={loginUrl} className={buttonVariants({ variant: "outline", className: "w-full" })}>
                J’ai déjà un compte
              </Link>
              {invite.artisanSlug && (
                <Link
                  href={`/site/${invite.artisanSlug}`}
                  className={buttonVariants({ variant: "ghost", className: "w-full" })}
                >
                  Voir la page vitrine
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
