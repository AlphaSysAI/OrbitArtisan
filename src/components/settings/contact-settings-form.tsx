"use client";

import * as React from "react";
import { toast } from "sonner";

import { joinPersonName, splitPersonName } from "@/lib/contacts/display-name";

import { AddressAutocomplete } from "@/components/settings/address-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ContactSettingsInitial = {
  /** Legacy : utilisé si firstName / lastName absents */
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type SaveResult =
  | { ok: true }
  | { ok: false; error: "missing_name" | "invalid_phone" | "invalid_postal_code" | "invalid_email" | "save_failed" };

export function ContactSettingsForm({
  initialValues,
  displayNameLabel,
  splitName = false,
  emailEditable = false,
  geocodeAddress = false,
  saveAction,
}: {
  initialValues: ContactSettingsInitial;
  displayNameLabel: string;
  /** Deux champs Prénom + Nom (clients). Sinon un seul champ texte. */
  splitName?: boolean;
  emailEditable?: boolean;
  /** Active l'autocomplétion d'adresse + géolocalisation (artisans, pour la recherche client). */
  geocodeAddress?: boolean;
  saveAction: (formData: FormData) => Promise<SaveResult>;
}) {
  const parsedName =
    initialValues.firstName !== undefined
      ? { firstName: initialValues.firstName, lastName: initialValues.lastName ?? "" }
      : splitPersonName(initialValues.displayName ?? "");

  const [firstName, setFirstName] = React.useState(parsedName.firstName);
  const [lastName, setLastName] = React.useState(parsedName.lastName);
  const [displayName, setDisplayName] = React.useState(initialValues.displayName ?? "");
  const [email, setEmail] = React.useState(initialValues.email ?? "");
  const [phone, setPhone] = React.useState(initialValues.phone ?? "");
  const [addressLine1, setAddressLine1] = React.useState(initialValues.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = React.useState(initialValues.addressLine2 ?? "");
  const [postalCode, setPostalCode] = React.useState(initialValues.postalCode ?? "");
  const [city, setCity] = React.useState(initialValues.city ?? "");
  const [saving, setSaving] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    if (splitName) {
      fd.set("display_name", joinPersonName(firstName, lastName));
    }
    const res = await saveAction(fd);
    setSaving(false);

    if (!res.ok) {
      toast.error(
        res.error === "missing_name"
          ? "Le nom est obligatoire."
          : res.error === "invalid_phone"
            ? "Numéro de téléphone invalide (6 chiffres minimum)."
            : res.error === "invalid_postal_code"
              ? "Code postal invalide (5 chiffres attendus en France)."
              : res.error === "invalid_email"
                ? "Adresse e-mail invalide."
                : "Impossible d’enregistrer. Réessaie.",
      );
      return;
    }

    toast.success("Réglages enregistrés.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Identité</h2>
          <p className="text-sm text-muted-foreground">Comment tu apparais auprès des artisans ou des clients.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {splitName ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="first_name">Prénom</Label>
                <Input
                  id="first_name"
                  name="first_name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Camille"
                  autoComplete="given-name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nom</Label>
                <Input
                  id="last_name"
                  name="last_name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Martin"
                  autoComplete="family-name"
                  required
                />
              </div>
            </>
          ) : (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="display_name">{displayNameLabel}</Label>
              <Input
                id="display_name"
                name="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Prénom Nom"
                autoComplete="name"
                required
              />
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="email">Adresse e-mail</Label>
            {emailEditable ? (
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="toi@email.fr"
                autoComplete="email"
              />
            ) : (
              <>
                <Input id="email" name="email" value={email} readOnly disabled className="bg-muted/50" />
                <p className="text-xs text-muted-foreground">
                  C’est l’adresse utilisée pour te connecter. Pour la changer, crée un compte avec une nouvelle adresse
                  ou contacte l’assistance.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Coordonnées</h2>
          <p className="text-sm text-muted-foreground">Téléphone et adresse postale pour les devis et factures.</p>
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
            />
          </div>
          {geocodeAddress ? (
            <div className="space-y-4 sm:col-span-2">
              <AddressAutocomplete
                initialAddressLine1={initialValues.addressLine1}
                initialPostalCode={initialValues.postalCode}
                initialCity={initialValues.city}
                initialLatitude={initialValues.latitude ?? null}
                initialLongitude={initialValues.longitude ?? null}
              />
              <div className="space-y-2">
                <Label htmlFor="address_line2">
                  Complément d&apos;adresse <span className="font-normal text-muted-foreground">(facultatif)</span>
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
          ) : (
            <>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="address_line1">Adresse</Label>
                <Input
                  id="address_line1"
                  name="address_line1"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="12 rue des Artisans"
                  autoComplete="address-line1"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="address_line2">
                  Complément d&apos;adresse <span className="font-normal text-muted-foreground">(facultatif)</span>
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
              <div className="space-y-2">
                <Label htmlFor="postal_code">Code postal</Label>
                <Input
                  id="postal_code"
                  name="postal_code"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="75001"
                  autoComplete="postal-code"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Ville</Label>
                <Input
                  id="city"
                  name="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Paris"
                  autoComplete="address-level2"
                />
              </div>
            </>
          )}
        </div>
      </section>

      <Button type="submit" disabled={saving} className="w-full sm:w-auto">
        {saving ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
