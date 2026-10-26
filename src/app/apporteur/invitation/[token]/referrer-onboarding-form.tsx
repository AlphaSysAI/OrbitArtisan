"use client";

import { useActionState, useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { TermsAcceptanceField } from "@/components/legal/terms-acceptance-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { acceptReferrerInvitationAction, type ReferrerOnboardingState } from "./actions";

type Prefill = {
  email: string;
  firstName: string;
  lastName: string;
  siren: string;
  businessName: string;
  siret: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  suggestedVatNumber: string;
};

const ERROR_TEXT: Record<string, { title: string; body: string }> = {
  link_invalid: { title: "Lien invalide", body: "Ce lien n’est pas reconnu. Demande un nouveau lien à l’équipe Soline." },
  link_expired: { title: "Lien expiré", body: "Ce lien a dépassé ses 14 jours de validité. Demande un nouveau lien à l’équipe Soline." },
  link_used: { title: "Accès déjà créé", body: "Ce lien a déjà servi. Connecte-toi avec ton e-mail et ton mot de passe." },
  link_cancelled: { title: "Invitation annulée", body: "Cette invitation a été annulée. Contacte l’équipe Soline." },
  email_has_account: {
    title: "Adresse déjà utilisée",
    body: "Un compte Soline existe déjà avec cette adresse. Contacte l’équipe Soline pour qu’elle t’envoie une invitation sur une autre adresse.",
  },
  invalid_fields: { title: "Quelques informations à corriger", body: "Vérifie les champs signalés ci-dessous." },
  server_error: { title: "Création impossible pour le moment", body: "Rien n’a été créé. Réessaie dans quelques minutes." },
};

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

export function ReferrerOnboardingForm({ token, prefill }: { token: string; prefill: Prefill }) {
  const initial: ReferrerOnboardingState = { error: null, fieldErrors: {}, values: {} };
  const [state, formAction, pending] = useActionState(acceptReferrerInvitationAction, initial);
  const v = (key: string, fallback: string) => state.values[key] ?? fallback;
  const [vatRegime, setVatRegime] = useState(v("vat_regime", ""));
  const err = state.fieldErrors;
  const banner = state.error ? ERROR_TEXT[state.error] : null;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="token" value={token} />

      {banner ? (
        <Alert variant="destructive">
          <AlertTitle>{banner.title}</AlertTitle>
          <AlertDescription>{banner.body}</AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Toi</legend>
        <div className="space-y-2">
          <Label htmlFor="email">Adresse e-mail</Label>
          <Input id="email" value={prefill.email} readOnly disabled />
          <p className="text-xs text-muted-foreground">Adresse de l’invitation : elle servira d’identifiant.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first_name">Prénom</Label>
            <Input id="first_name" name="first_name" defaultValue={v("first_name", prefill.firstName)} autoComplete="given-name" required />
            <FieldError message={err.first_name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Nom</Label>
            <Input id="last_name" name="last_name" defaultValue={v("last_name", prefill.lastName)} autoComplete="family-name" required />
            <FieldError message={err.last_name} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={v("phone", "")} autoComplete="tel" placeholder="06 12 34 56 78" required />
          <FieldError message={err.phone} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Ton entreprise</legend>
        <p className="text-xs text-muted-foreground">
          Ces informations figureront sur tes factures de commission. Celles déjà remplies viennent de l’Annuaire des
          entreprises : vérifie-les.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="siren">SIREN</Label>
            <Input id="siren" value={prefill.siren} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="siret">SIRET (facultatif)</Label>
            <Input id="siret" name="siret" inputMode="numeric" defaultValue={v("siret", prefill.siret)} />
            <FieldError message={err.siret} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="business_name">Dénomination</Label>
          <Input id="business_name" name="business_name" defaultValue={v("business_name", prefill.businessName)} autoComplete="organization" required />
          <FieldError message={err.business_name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address_line1">Adresse</Label>
          <Input id="address_line1" name="address_line1" defaultValue={v("address_line1", prefill.addressLine1)} autoComplete="address-line1" required />
          <FieldError message={err.address_line1} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address_line2">Complément (facultatif)</Label>
          <Input id="address_line2" name="address_line2" defaultValue={v("address_line2", "")} autoComplete="address-line2" />
          <FieldError message={err.address_line2} />
        </div>
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <div className="space-y-2">
            <Label htmlFor="postal_code">Code postal</Label>
            <Input id="postal_code" name="postal_code" inputMode="numeric" defaultValue={v("postal_code", prefill.postalCode)} autoComplete="postal-code" required />
            <FieldError message={err.postal_code} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Ville</Label>
            <Input id="city" name="city" defaultValue={v("city", prefill.city)} autoComplete="address-level2" required />
            <FieldError message={err.city} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Régime de TVA</p>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="radio" name="vat_regime" value="franchise" className="mt-0.5" checked={vatRegime === "franchise"} onChange={() => setVatRegime("franchise")} />
            <span>Franchise en base (micro-entreprise) — « TVA non applicable, art. 293 B du CGI »</span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="radio" name="vat_regime" value="normal" className="mt-0.5" checked={vatRegime === "normal"} onChange={() => setVatRegime("normal")} />
            <span>Assujetti à la TVA — commissions facturées avec TVA à 20 %</span>
          </label>
          <FieldError message={err.vat_regime} />
        </div>
        {vatRegime === "normal" ? (
          <div className="space-y-2">
            <Label htmlFor="vat_number">N° de TVA intracommunautaire</Label>
            <Input id="vat_number" name="vat_number" defaultValue={v("vat_number", prefill.suggestedVatNumber)} required />
            <FieldError message={err.vat_number} />
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold">Ton mot de passe</legend>
        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe (8 caractères minimum)</Label>
          <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required />
          <FieldError message={err.password} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password_confirm">Confirmation</Label>
          <PasswordInput id="password_confirm" name="password_confirm" autoComplete="new-password" minLength={8} required />
          <FieldError message={err.password_confirm} />
        </div>
      </fieldset>

      <div className="space-y-2">
        <TermsAcceptanceField />
        <FieldError message={err.accept_terms} />
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? "Création en cours…" : "Créer mon accès apporteur"}
      </Button>
    </form>
  );
}
