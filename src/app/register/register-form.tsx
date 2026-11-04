"use client";

import { useState } from "react";

import { authInputClassName } from "@/components/auth/auth-styles";
import { PasswordInput } from "@/components/auth/password-input";
import { TermsAcceptanceField } from "@/components/legal/terms-acceptance-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signUpWithPassword } from "./actions";

type RegisterFormProps = {
  next: string;
  prefillEmail: string;
  inviteToken: string;
  promoCode: string;
};

export function RegisterForm({ next, prefillEmail, inviteToken, promoCode }: RegisterFormProps) {
  const [clientError, setClientError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    const passwordConfirm = String(new FormData(form).get("password_confirm") ?? "");

    if (password.length < 8) {
      event.preventDefault();
      setClientError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    if (password !== passwordConfirm) {
      event.preventDefault();
      setClientError("Les mots de passe ne correspondent pas.");
      return;
    }

    setClientError(null);
  }

  return (
    <form action={signUpWithPassword} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="role" value="artisan" />
      {inviteToken ? <input type="hidden" name="invite" value={inviteToken} /> : null}

      {clientError ? (
        <Alert variant="destructive">
          <AlertTitle>Vérifie ton mot de passe</AlertTitle>
          <AlertDescription>{clientError}</AlertDescription>
        </Alert>
      ) : null}

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
          autoFocus={!prefillEmail}
          className={authInputClassName}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
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

      <details className="group rounded-xl border border-border/70 bg-card/60 px-3.5 py-2.5" open={!!promoCode}>
        <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground transition-colors select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span>
          J&apos;ai un code ambassadeur
        </summary>
        <div className="mt-3 space-y-2">
          <Label htmlFor="promo_code" className="sr-only">Code ambassadeur</Label>
          <Input
            id="promo_code"
            name="promo_code"
            type="text"
            placeholder="AMBASSADEUR"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={32}
            defaultValue={promoCode}
            className={authInputClassName}
          />
          {promoCode ? (
            <p className="text-xs text-muted-foreground">
              −25 % sur Pro et Premium, tant que vous restez abonné, pour les 50 premiers abonnés avant le 30 novembre 2026.
            </p>
          ) : null}
        </div>
      </details>

      <TermsAcceptanceField />

      <Button className="h-12 w-full rounded-xl bg-brand text-base text-brand-foreground hover:bg-brand/90" type="submit">
        Créer mon compte et démarrer l&apos;essai
      </Button>
    </form>
  );
}
