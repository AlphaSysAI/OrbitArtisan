import { safeNextPath } from "@/lib/auth/safe-next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, MailCheck, TriangleAlert } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { authInputClassName } from "@/components/auth/auth-styles";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sanitizeEmailParam } from "@/lib/auth/email-confirmation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseMissing } from "@/components/supabase-missing";

import { resendConfirmationEmail, signInWithPassword } from "./actions";

type Role = "artisan" | "particulier";

const ERROR_MESSAGES: Record<string, { title: string; body: string }> = {
  invalid_credentials: {
    title: "Identifiants incorrects",
    body: "L'adresse e-mail ou le mot de passe ne correspond pas. Vérifie la saisie et réessaie.",
  },
  email_not_confirmed: {
    title: "Adresse pas encore confirmée",
    body: "Clique sur le lien reçu par e-mail pour activer ton compte. Tu peux en demander un nouveau ci-dessous.",
  },
  pkce_missing: {
    title: "Connexion à terminer",
    body: "Ce lien a été ouvert dans un autre navigateur. Connecte-toi avec ton mot de passe si ton adresse est confirmée.",
  },
  auth_unavailable: {
    title: "Connexion temporairement indisponible",
    body: "Réessaie d’ouvrir le lien dans quelques instants.",
  },
  link_expired: {
    title: "Lien expiré",
    body: "Ce lien de confirmation n'est plus valable. Demande un nouvel e-mail ci-dessous.",
  },
  link_invalid: {
    title: "Lien déjà utilisé",
    body: "Ce lien a déjà servi ou n'est plus valable. Si ton adresse est confirmée, connecte-toi simplement.",
  },
  resend_rate_limited: {
    title: "Patiente un instant",
    body: "Un e-mail vient déjà d'être envoyé. Attends une minute avant d'en redemander un.",
  },
  resend_failed: {
    title: "Envoi impossible",
    body: "L'e-mail n'a pas pu être renvoyé. Vérifie l'adresse ou réessaie dans quelques minutes.",
  },
};

const RESENDABLE_ERRORS = new Set(["email_not_confirmed", "link_expired", "resend_failed", "resend_rate_limited"]);

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
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null, isParticulier ? "/compte" : "/app");
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const success = typeof sp.success === "string" ? sp.success : undefined;
  const prefillEmail = sanitizeEmailParam(typeof sp.email === "string" ? sp.email : "");
  const inviteToken = typeof sp.invite === "string" ? sp.invite : "";
  const info = typeof sp.info === "string" ? sp.info : undefined;
  const resent = sp.resent === "1";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  const registerHref = isParticulier
    ? `/inscription-client?next=${encodeURIComponent(next)}${
        inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ""
      }`
    : `/register?next=${encodeURIComponent(next)}${
        inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ""
      }${prefillEmail ? `&email=${encodeURIComponent(prefillEmail)}` : ""}`;

  const awaitingConfirmation = success === "check_email";
  const justConfirmed = success === "email_confirmed";
  const errorCopy = error ? (ERROR_MESSAGES[error] ?? { title: "Impossible de se connecter", body: "Une erreur est survenue. Réessaie." }) : null;
  const canResend = !!prefillEmail && (awaitingConfirmation || (!!error && RESENDABLE_ERRORS.has(error)));

  const title = awaitingConfirmation
    ? "Vérifie ta boîte mail"
    : justConfirmed
      ? "Adresse confirmée, bienvenue !"
      : isParticulier
        ? "Content de vous revoir"
        : "Bon retour parmi nous";

  const description = awaitingConfirmation ? (
    <>
      Un lien de confirmation vient de partir vers{" "}
      {prefillEmail ? <strong className="font-semibold text-foreground">{prefillEmail}</strong> : "ton adresse"}.
      Clique dessus pour activer ton compte.
    </>
  ) : justConfirmed ? (
    "Ton compte est activé. Saisis ton mot de passe pour démarrer la configuration de ton espace."
  ) : isParticulier ? (
    "Vos devis, vos factures et vos échanges avec votre artisan."
  ) : (
    "Connecte-toi pour retrouver tes appels, devis, factures et ton planning."
  );

  return (
    <AuthShell
      variant={isParticulier ? "client" : "artisan-login"}
      eyebrow={isParticulier ? "Espace client" : "Espace artisan"}
      title={title}
      description={description}
    >
      {errorCopy ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{errorCopy.title}</AlertTitle>
          <AlertDescription>{errorCopy.body}</AlertDescription>
        </Alert>
      ) : null}

      {justConfirmed ? (
        <div className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/10 p-4 text-sm">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" />
          <p>
            <span className="font-semibold">E-mail vérifié.</span>{" "}
            <span className="text-muted-foreground">Ton adresse est déjà remplie, il ne reste que le mot de passe.</span>
          </p>
        </div>
      ) : null}

      {info === "rdv_enregistre" ? (
        <Alert>
          <AlertTitle>Demande de RDV enregistrée</AlertTitle>
          <AlertDescription>
            Connecte-toi avec cette adresse e-mail pour retrouver ton rendez-vous dans ton espace client.
          </AlertDescription>
        </Alert>
      ) : null}

      {awaitingConfirmation ? (
        <div className="app-surface space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand">
              <MailCheck className="size-5" />
            </span>
            <ol className="space-y-1.5 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">1.</span> Ouvre l&apos;e-mail « Confirme ton adresse » de Soline.
              </li>
              <li>
                <span className="font-medium text-foreground">2.</span> Clique sur « Confirmer mon adresse ».
              </li>
              <li>
                <span className="font-medium text-foreground">3.</span> Tu reviens ici, connecté ou e-mail déjà rempli.
              </li>
            </ol>
          </div>
          {resent ? (
            <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">Nouvel e-mail envoyé.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Rien reçu après 2 minutes ? Regarde dans les spams ou l&apos;onglet Promotions.
            </p>
          )}
        </div>
      ) : null}

      {canResend ? (
        <form action={resendConfirmationEmail}>
          <input type="hidden" name="email" value={prefillEmail} />
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="role" value={role} />
          <Button type="submit" variant="outline" className="h-11 w-full rounded-xl">
            Renvoyer l&apos;e-mail de confirmation
          </Button>
        </form>
      ) : null}

      {awaitingConfirmation ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          Adresse déjà confirmée ?
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : null}

      <form action={signInWithPassword} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="role" value={role} />
        <div className="space-y-2">
          <Label htmlFor="email">Adresse e-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder={isParticulier ? "vous@exemple.fr" : "toi@entreprise.fr"}
            autoComplete="email"
            required
            defaultValue={prefillEmail}
            autoFocus={!prefillEmail}
            className={authInputClassName}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password">Mot de passe</Label>
            <Link
              href={`/login/mot-de-passe-oublie${prefillEmail ? `?email=${encodeURIComponent(prefillEmail)}` : ""}`}
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-brand hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            autoFocus={!!prefillEmail && !awaitingConfirmation}
            className={authInputClassName}
          />
        </div>
        <Button className="h-11 w-full rounded-xl text-base" type="submit">
          Se connecter
        </Button>
      </form>

      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4 text-center text-sm">
        <p className="text-muted-foreground">
          {isParticulier ? "Pas encore de compte client ?" : "Pas encore de compte artisan ?"}
        </p>
        <Link
          className={buttonVariants({ variant: "link", className: "h-auto px-0 font-semibold text-brand" })}
          href={registerHref}
        >
          {isParticulier ? "Créer mon compte client" : "Démarrer mon essai gratuit"}
        </Link>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          className="underline-offset-4 hover:text-foreground hover:underline"
          href={
            isParticulier
              ? `/login?role=artisan&next=${encodeURIComponent("/app")}`
              : `/login?role=particulier&next=${encodeURIComponent("/compte")}`
          }
        >
          {isParticulier ? "Vous êtes artisan ? Espace artisan" : "Vous êtes client d'un artisan ? Espace client"}
        </Link>
      </p>
    </AuthShell>
  );
}
