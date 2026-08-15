"use client";

import { useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signUpWithPassword } from "./actions";

type RegisterFormProps = {
  next: string;
  prefillEmail: string;
  inviteToken: string;
};

export function RegisterForm({ next, prefillEmail, inviteToken }: RegisterFormProps) {
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
        />
      </div>

      <Button className="w-full" type="submit">
        Créer mon compte artisan
      </Button>
    </form>
  );
}
