import Link from "next/link";
import { ArrowLeft, MailCheck, TriangleAlert } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { authInputClassName } from "@/components/auth/auth-styles";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sanitizeEmailParam } from "@/lib/auth/email-confirmation";

import { requestPasswordReset } from "../password-actions";

export const metadata = { title: "Mot de passe oublié · Soline" };

const ERROR_MESSAGES: Record<string, { title: string; body: string }> = {
  invalid_email: { title: "Adresse invalide", body: "Saisis l'adresse e-mail de ton compte Soline." },
  rate_limited: {
    title: "Patiente un instant",
    body: "Un e-mail vient déjà d'être envoyé. Attends une minute avant d'en redemander un.",
  },
  link_expired: {
    title: "Lien expiré",
    body: "Ce lien de réinitialisation n'est plus valable (expiré ou déjà utilisé). Demande-en un nouveau ci-dessous.",
  },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const email = sanitizeEmailParam(typeof sp.email === "string" ? sp.email : "");
  const error = typeof sp.error === "string" ? ERROR_MESSAGES[sp.error] : undefined;
  const sent = sp.sent === "1";
  const loginHref = `/login${email ? `?email=${encodeURIComponent(email)}` : ""}`;

  return (
    <AuthShell
      variant="artisan-login"
      eyebrow="Mot de passe oublié"
      title={sent ? "Regarde tes e-mails" : "Pas de panique"}
      description={
        sent ? (
          <>
            Si un compte existe pour{" "}
            <strong className="font-semibold text-foreground">{email}</strong>, un lien pour choisir un nouveau mot de
            passe vient de partir.
          </>
        ) : (
          "Indique l'adresse e-mail de ton compte : on t'envoie un lien pour choisir un nouveau mot de passe."
        )
      }
    >
      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.body}</AlertDescription>
        </Alert>
      ) : null}

      {sent ? (
        <div className="app-surface flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand">
            <MailCheck className="size-5" />
          </span>
          <p>
            Le lien fonctionne sur n&apos;importe quel appareil, une seule fois. Rien reçu après 2 minutes ? Regarde dans
            les spams, ou renvoie-le ci-dessous.
          </p>
        </div>
      ) : null}

      <form action={requestPasswordReset} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Adresse e-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="toi@entreprise.fr"
            autoComplete="email"
            required
            defaultValue={email}
            autoFocus={!email}
            className={authInputClassName}
          />
        </div>
        <Button className="h-11 w-full rounded-xl text-base" type="submit" variant={sent ? "outline" : "default"}>
          {sent ? "Renvoyer le lien" : "Recevoir le lien"}
        </Button>
      </form>

      <Link
        href={loginHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Retour à la connexion
      </Link>
    </AuthShell>
  );
}
