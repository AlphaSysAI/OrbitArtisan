"use client";

import * as React from "react";
import { toast } from "sonner";

import { AddressAutocomplete } from "@/components/settings/address-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveOnboardingContactStep, type OnboardingContactError } from "./actions";

const ERROR_MESSAGES: Record<OnboardingContactError, string> = {
  missing_name: "Indique ton nom (contact).",
  missing_business_name: "Indique ta raison sociale ou ton nom commercial.",
  invalid_phone: "Numéro de téléphone obligatoire (6 chiffres minimum).",
  missing_address: "L’adresse est obligatoire.",
  invalid_postal_code: "Code postal obligatoire (5 chiffres).",
  missing_city: "La ville est obligatoire.",
  save_failed: "Enregistrement impossible. Réessaie.",
};

export function OnboardingContactStep({
  initialValues,
  email,
}: {
  email: string;
  initialValues: {
    name: string;
    businessName: string;
    phone: string;
    addressLine1: string;
    addressLine2: string;
    postalCode: string;
    city: string;
    latitude: number | null;
    longitude: number | null;
  };
}) {
  const [displayName, setDisplayName] = React.useState(initialValues.name);
  const [businessName, setBusinessName] = React.useState(initialValues.businessName);
  const [phone, setPhone] = React.useState(initialValues.phone);
  const [addressLine2, setAddressLine2] = React.useState(initialValues.addressLine2);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await saveOnboardingContactStep(fd);
      if (res && !res.ok) {
        toast.error(ERROR_MESSAGES[res.error]);
      }
    } catch {
      // redirect() lance une exception — comportement attendu après succès
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Identité</h2>
          <p className="text-sm text-muted-foreground">
            Ces informations apparaissent sur tes devis et factures.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="business_name">Raison sociale / nom commercial</Label>
            <Input
              id="business_name"
              name="business_name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Dupont Plomberie"
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="display_name">Nom du contact</Label>
            <Input
              id="display_name"
              name="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jean Dupont"
              autoComplete="name"
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="email">E-mail de connexion</Label>
            <Input id="email" value={email} readOnly disabled className="bg-muted/50" />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Coordonnées</h2>
          <p className="text-sm text-muted-foreground">Téléphone et adresse professionnelle.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="phone">Téléphone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="06 12 34 56 78"
              autoComplete="tel"
              required
            />
          </div>
          <div className="space-y-4 sm:col-span-2">
            <AddressAutocomplete
              initialAddressLine1={initialValues.addressLine1}
              initialPostalCode={initialValues.postalCode}
              initialCity={initialValues.city}
              initialLatitude={initialValues.latitude}
              initialLongitude={initialValues.longitude}
            />
            <div className="space-y-2">
              <Label htmlFor="address_line2">
                Complément d&apos;adresse{" "}
                <span className="font-normal text-muted-foreground">(facultatif)</span>
              </Label>
              <Input
                id="address_line2"
                name="address_line2"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="Bât. B, appt. 4"
                autoComplete="address-line2"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="flex justify-end border-t pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Continuer"}
        </Button>
      </div>
    </form>
  );
}
