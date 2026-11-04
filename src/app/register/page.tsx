import { TRIAL_DURATION_DAYS } from "@/lib/billing/subscription-access";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseMissing } from "@/components/supabase-missing";

import { RegisterForm } from "./register-form";

const ERROR_MESSAGES: Record<string, { title: string; body: string }> = {
  password_mismatch: { title: "Mots de passe différents", body: "Les deux mots de passe doivent être identiques." },
  password_too_short: { title: "Mot de passe trop court", body: "Utilise au moins 8 caractères." },
  terms_not_accepted: {
    title: "Acceptation requise",
    body: "Tu dois accepter les CGU et les CGV de Soline pour créer un compte.",
  },
  promo_invalid: {
    title: "Code non reconnu",
    body: "Vérifie le code ambassadeur (lettres et chiffres uniquement) ou laisse le champ vide.",
  },
  rate_limited: {
    title: "Trop de tentatives",
    body: "Trop d'inscriptions ont été demandées en peu de temps. Réessaie dans une heure, ou connecte-toi si tu as déjà reçu l'e-mail de confirmation.",
  },
  signup_failed: {
    title: "Inscription impossible",
    body: "Cette adresse est peut-être déjà utilisée, ou une erreur est survenue. Réessaie ou connecte-toi.",
  },
};

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
  const next = typeof sp.next === "string" ? sp.next : "/app/onboarding";
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const prefillEmail = typeof sp.email === "string" ? sp.email : "";
  const inviteToken = typeof sp.invite === "string" ? sp.invite : "";
  const promoCode = typeof sp.code === "string" ? sp.code.slice(0, 32) : "";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(next);

  const loginHref = `/login?role=artisan&next=${encodeURIComponent(next)}${
    inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ""
  }${prefillEmail ? `&email=${encodeURIComponent(prefillEmail)}` : ""}`;

  const errorCopy = error ? ERROR_MESSAGES[error] : null;

  return (
    <AuthShell
      variant="artisan-register"
      eyebrow={`Essai gratuit · ${TRIAL_DURATION_DAYS} jours`}
      title="Créons ton espace Soline"
      description="Devis, factures, planning, site vitrine et secrétaire vocale. Tout est prêt en quelques minutes."
    >
      <ol className="grid grid-cols-3 gap-2 text-xs" aria-label="Étapes de l'inscription">
        {["Ton compte", "Confirmation e-mail", "Ton atelier"].map((label, index) => (
          <li
            key={label}
            className={
              index === 0
                ? "rounded-xl border border-brand/40 bg-brand/10 px-2.5 py-2 font-medium text-foreground"
                : "rounded-xl border border-border bg-card/60 px-2.5 py-2 text-muted-foreground"
            }
          >
            <span className={index === 0 ? "block text-brand" : "block"}>Étape {index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {errorCopy ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{errorCopy.title}</AlertTitle>
          <AlertDescription>{errorCopy.body}</AlertDescription>
        </Alert>
      ) : null}

      {inviteToken ? (
        <Alert>
          <AlertTitle>Invitation reçue</AlertTitle>
          <AlertDescription>
            Crée ton compte avec l&apos;adresse e-mail invitée pour activer ton espace professionnel.
          </AlertDescription>
        </Alert>
      ) : null}

      <RegisterForm next={next} prefillEmail={prefillEmail} inviteToken={inviteToken} promoCode={promoCode} />

      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-2xl border border-border/70 bg-card/60 p-4 text-xs text-muted-foreground">
        <li>✓ {TRIAL_DURATION_DAYS} jours offerts</li>
        <li>✓ 0 € aujourd&apos;hui</li>
        <li>✓ Soline incluse (10 appels)</li>
        <li>✓ Résiliable à tout moment</li>
        <li className="col-span-2 pt-1 text-[11px]">
          Une carte bancaire te sera demandée au démarrage de l&apos;essai, après la configuration de ton atelier.
        </li>
      </ul>

      <p className="text-center text-sm text-muted-foreground">
        Déjà un compte ?{" "}
        <Link className="font-semibold text-brand underline-offset-4 hover:underline" href={loginHref}>
          Se connecter
        </Link>
      </p>
    </AuthShell>
  );
}
