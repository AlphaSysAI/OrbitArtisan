"use client";

import * as React from "react";
import { toast } from "sonner";

import { updateLegalSettings } from "@/app/app/reglages/legal-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LegalSettingsForm({
  initialValues,
}: {
  initialValues: {
    siren: string | null;
    siret: string | null;
    vat_number: string | null;
    trade_register_number: string | null;
    decennale_insurer: string | null;
    decennale_policy_number: string | null;
    rc_pro_insurer: string | null;
    rc_pro_number: string | null;
    mediator_name: string | null;
    mediator_url: string | null;
    default_payment_terms_days: number;
    default_retention_rate: number;
    auto_reminder_enabled: boolean;
  };
}) {
  async function onSubmit(formData: FormData) {
    const res = await updateLegalSettings(formData);
    if (!res.ok) {
      toast.error(
        res.error === "invalid_siren"
          ? "SIREN invalide (9 chiffres)."
          : res.error === "invalid_siret"
            ? "SIRET invalide (14 chiffres)."
            : res.error === "invalid_vat"
              ? "Numéro TVA invalide."
              : "Impossible d'enregistrer.",
      );
      return;
    }
    toast.success("Informations légales enregistrées.");
  }

  return (
    <form action={onSubmit} className="space-y-6 rounded-2xl border bg-card p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="siren">SIREN</Label>
          <Input id="siren" name="siren" defaultValue={initialValues.siren ?? ""} placeholder="123456789" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="siret">SIRET</Label>
          <Input id="siret" name="siret" defaultValue={initialValues.siret ?? ""} placeholder="12345678901234" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vat_number">N° TVA intracommunautaire</Label>
          <Input id="vat_number" name="vat_number" defaultValue={initialValues.vat_number ?? ""} placeholder="FR12345678901" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="trade_register_number">RCS / RM</Label>
          <Input
            id="trade_register_number"
            name="trade_register_number"
            defaultValue={initialValues.trade_register_number ?? ""}
          />
        </div>
      </div>

      <div className="space-y-4 border-t pt-4">
        <h3 className="font-medium">Assurances</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="decennale_insurer">Assureur décennale</Label>
            <Input id="decennale_insurer" name="decennale_insurer" defaultValue={initialValues.decennale_insurer ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="decennale_policy_number">N° contrat décennale</Label>
            <Input
              id="decennale_policy_number"
              name="decennale_policy_number"
              defaultValue={initialValues.decennale_policy_number ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rc_pro_insurer">Assureur RC Pro</Label>
            <Input id="rc_pro_insurer" name="rc_pro_insurer" defaultValue={initialValues.rc_pro_insurer ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rc_pro_number">N° contrat RC Pro</Label>
            <Input id="rc_pro_number" name="rc_pro_number" defaultValue={initialValues.rc_pro_number ?? ""} />
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t pt-4">
        <h3 className="font-medium">Médiation & facturation</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="mediator_name">Médiateur de la consommation</Label>
            <Input id="mediator_name" name="mediator_name" defaultValue={initialValues.mediator_name ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mediator_url">URL médiateur</Label>
            <Input id="mediator_url" name="mediator_url" defaultValue={initialValues.mediator_url ?? ""} type="url" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_payment_terms_days">Délai de paiement (jours)</Label>
            <Input
              id="default_payment_terms_days"
              name="default_payment_terms_days"
              type="number"
              min={0}
              max={365}
              defaultValue={initialValues.default_payment_terms_days}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_retention_rate">Retenue de garantie (%)</Label>
            <Input
              id="default_retention_rate"
              name="default_retention_rate"
              inputMode="decimal"
              defaultValue={String(initialValues.default_retention_rate)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="auto_reminder_enabled"
            defaultChecked={initialValues.auto_reminder_enabled}
            className="size-4 rounded border"
          />
          Relances automatiques des impayés par email
        </label>
      </div>

      <Button type="submit">Enregistrer</Button>
    </form>
  );
}
