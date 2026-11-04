import { redirect } from "next/navigation";
import { KeyRound, TriangleAlert } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { authInputClassName } from "@/components/auth/auth-styles";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FORGOT_PASSWORD_PATH } from "@/lib/auth/email-confirmation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { updatePassword } from "../password-actions";

export const metadata = { title: "Nouveau mot de passe · Soline" };

const ERROR_MESSAGES: Record<string, { title: string; body: string }> = {
  password_too_short: { title: "Mot de passe trop court", body: "Utilise au moins 8 caractères." },
  password_mismatch: { title: "Mots de passe différents", body: "Les deux saisies doivent être identiques." },
  same_password: { title: "Mot de passe identique", body: "Choisis un mot de passe différent de l'ancien." },
  weak_password: {
    title: "Mot de passe trop faible",
    body: "Ce mot de passe est trop simple ou connu. Mélange lettres, chiffres et symboles.",
  },
  update_failed: { title: "Enregistrement impossible", body: "Une erreur est survenue. Réessaie dans un instant." },
};

export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Pas de session : lien jamais ouvert, expiré, ou ouvert dans un autre navigateur.
  if (!user) redirect(`${FORGOT_PASSWORD_PATH}?error=link_expired`);

  const sp = await searchParams;
  const error = typeof sp.error === "string" ? ERROR_MESSAGES[sp.error] : undefined;

  return (
    <AuthShell
      variant="artisan-login"
      eyebrow="Sécurité du compte"
      title="Choisis un nouveau mot de passe"
      description={
        <>
          Pour le compte <strong className="font-semibold text-foreground">{user.email}</strong>. Tu resteras connecté
          après l&apos;enregistrement.
        </>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.body}</AlertDescription>
        </Alert>
      ) : null}

      <form action={updatePassword} className="space-y-4">
        {/* Aide les gestionnaires de mots de passe à associer le bon compte. */}
        <input type="email" name="username" autoComplete="username" defaultValue={user.email ?? ""} hidden readOnly />
        <div className="space-y-2">
          <Label htmlFor="password">Nouveau mot de passe</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
            autoFocus
            className={authInputClassName}
          />
          <p className="text-xs text-muted-foreground">Minimum 8 caractères.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password_confirm">Confirmer le mot de passe</Label>
          <PasswordInput
            id="password_confirm"
            name="password_confirm"
            autoComplete="new-password"
            minLength={8}
            required
            className={authInputClassName}
          />
        </div>
        <Button className="h-11 w-full rounded-xl text-base" type="submit">
          <KeyRound />
          Enregistrer et me connecter
        </Button>
      </form>
    </AuthShell>
  );
}
