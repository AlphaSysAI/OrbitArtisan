"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveOnboardingLegalStep, type OnboardingLegalError } from "./actions";

const ERROR_MESSAGES: Record<OnboardingLegalError, string> = {
  invalid_siren: "SIREN obligatoire (9 chiffres).",
  invalid_siret: "SIRET obligatoire (14 chiffres, cohérent avec le SIREN).",
  invalid_vat: "N° TVA intracommunautaire obligatoire et valide.",
  invalid_trade_register: "N° RCS / RM obligatoire.",
  missing_decennale: "Assurance décennale : assureur et n° de contrat obligatoires.",
  missing_rc_pro: "RC Pro : assureur et n° de contrat obligatoires.",
  missing_mediator: "Nom du médiateur de la consommation obligatoire.",
  invalid_mediator_url: "URL du médiateur obligatoire (https://…).",
  invalid_payment_terms: "Délai de paiement obligatoire (1 à 365 jours).",
  save_failed: "Enregistrement impossible. Réessaie.",
};

export function OnboardingLegalStep({
  initialValues,
}: {
  initialValues: {
    siren: string;
    siret: string;
    vatNumber: string;
    tradeRegisterNumber: string;
    decennaleInsurer: string;
    decennalePolicyNumber: string;
    rcProInsurer: string;
    rcProNumber: string;
    mediatorName: string;
    mediatorUrl: string;
    defaultPaymentTermsDays: number;
  };
}) {
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await saveOnboardingLegalStep(fd);
      if (res && !res.ok) {
        const msg =
          res.error in ERROR_MESSAGES
            ? ERROR_MESSAGES[res.error as keyof typeof ERROR_MESSAGES]
            : "Vérifie les champs obligatoires.";
        toast.error(msg);
      }
    } catch {
      // redirect après succès
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Identité légale</h2>
          <p className="text-sm text-muted-foreground">Obligatoire pour émettre des devis conformes.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="siren">SIREN</Label>
            <Input
              id="siren"
              name="siren"
              defaultValue={initialValues.siren}
              placeholder="123456789"
              inputMode="numeric"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="siret">SIRET</Label>
            <Input
              id="siret"
              name="siret"
              defaultValue={initialValues.siret}
              placeholder="12345678901234"
              inputMode="numeric"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vat_number">N° TVA intracommunautaire</Label>
            <Input
              id="vat_number"
              name="vat_number"
              defaultValue={initialValues.vatNumber}
              placeholder="FR12345678901"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="trade_register_number">RCS / RM</Label>
            <Input
              id="trade_register_number"
              name="trade_register_number"
              defaultValue={initialValues.tradeRegisterNumber}
              required
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <h3 className="font-medium">Assurances</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="decennale_insurer">Assureur décennale</Label>
            <Input
              id="decennale_insurer"
              name="decennale_insurer"
              defaultValue={initialValues.decennaleInsurer}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="decennale_policy_number">N° contrat décennale</Label>
            <Input
              id="decennale_policy_number"
              name="decennale_policy_number"
              defaultValue={initialValues.decennalePolicyNumber}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rc_pro_insurer">Assureur RC Pro</Label>
            <Input
              id="rc_pro_insurer"
              name="rc_pro_insurer"
              defaultValue={initialValues.rcProInsurer}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rc_pro_number">N° contrat RC Pro</Label>
            <Input
              id="rc_pro_number"
              name="rc_pro_number"
              defaultValue={initialValues.rcProNumber}
              required
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <h3 className="font-medium">Médiation & paiement</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="mediator_name">Médiateur de la consommation</Label>
            <Input
              id="mediator_name"
              name="mediator_name"
              defaultValue={initialValues.mediatorName}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mediator_url">URL du médiateur</Label>
            <Input
              id="mediator_url"
              name="mediator_url"
              type="url"
              defaultValue={initialValues.mediatorUrl}
              placeholder="https://…"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_payment_terms_days">Délai de paiement (jours)</Label>
            <Input
              id="default_payment_terms_days"
              name="default_payment_terms_days"
              type="number"
              min={1}
              max={365}
              defaultValue={initialValues.defaultPaymentTermsDays}
              required
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end border-t pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Finalisation…" : "Terminer et accéder à Soline"}
        </Button>
      </div>
    </form>
  );
}
