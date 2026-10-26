import { describe, expect, it } from "vitest";

import { parseReferrerInvitationInput, parseReferrerOnboarding } from "./validation";

// SIREN valide (clé de Luhn) et son n° de TVA FR.
const SIREN = "732829320";
const VAT = "FR44732829320";

const VALID = {
  first_name: "  Paul ",
  last_name: "Martin",
  phone: "06 12 34 56 78",
  business_name: "PM Conseil",
  siret: "",
  address_line1: "12 rue des Lilas",
  address_line2: "",
  postal_code: "11000",
  city: "Carcassonne",
  vat_regime: "franchise",
  vat_number: "",
  password: "motdepasse1",
  password_confirm: "motdepasse1",
  accept_terms: "1",
};

describe("invitation (admin)", () => {
  it("normalise l'e-mail et le SIREN", () => {
    const r = parseReferrerInvitationInput({ email: " Paul.Martin@Exemple.FR ", first_name: "Paul", last_name: "Martin", siren: "732 829 320" });
    expect(r).toEqual({ ok: true, value: { email: "paul.martin@exemple.fr", first_name: "Paul", last_name: "Martin", siren: SIREN } });
  });
  it("refuse un SIREN à la clé fausse et un e-mail invalide", () => {
    const r = parseReferrerInvitationInput({ email: "paul", first_name: "Paul", last_name: "Martin", siren: "732829321" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["email", "siren"]);
  });
});

describe("finalisation (apporteur)", () => {
  it("franchise : téléphone en E.164, pas de n° de TVA même s'il est saisi", () => {
    const r = parseReferrerOnboarding({ ...VALID, vat_number: VAT }, SIREN);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.phone).toBe("+33612345678");
      expect(r.value.first_name).toBe("Paul");
      expect(r.value.vat_number).toBeNull();
      expect(r.value.siret).toBeNull();
    }
  });

  it("assujetti : n° de TVA obligatoire et cohérent avec le SIREN de l'invitation", () => {
    expect(parseReferrerOnboarding({ ...VALID, vat_regime: "normal" }, SIREN)).toMatchObject({ ok: false, errors: { vat_number: expect.any(String) } });
    expect(parseReferrerOnboarding({ ...VALID, vat_regime: "normal", vat_number: "FR00123456789" }, SIREN)).toMatchObject({
      ok: false,
      errors: { vat_number: expect.stringContaining(VAT) },
    });
    const ok = parseReferrerOnboarding({ ...VALID, vat_regime: "normal", vat_number: "fr 44 732829320" }, SIREN);
    expect(ok.ok && ok.value.vat_number).toBe(VAT);
  });

  it("SIRET : doit appartenir au SIREN de l'invitation", () => {
    expect(parseReferrerOnboarding({ ...VALID, siret: "73282932000074" }, SIREN).ok).toBe(true);
    expect(parseReferrerOnboarding({ ...VALID, siret: "55210055400013" }, SIREN)).toMatchObject({ ok: false, errors: { siret: expect.any(String) } });
  });

  it("mot de passe différent, CGU non acceptées, régime absent : refus", () => {
    const r = parseReferrerOnboarding({ ...VALID, password_confirm: "autre", accept_terms: "", vat_regime: "" }, SIREN);
    expect(r.ok).toBe(false);
    const again = parseReferrerOnboarding({ ...VALID, password_confirm: "autre" }, SIREN);
    expect(again).toMatchObject({ ok: false, errors: { password_confirm: expect.any(String) } });
    if (!r.ok) expect(r.errors).toMatchObject({ accept_terms: expect.any(String), vat_regime: expect.any(String) });
  });

  it("champs non prévus (siren, email, status) ignorés : le SIREN reste celui de l'invitation", () => {
    const r = parseReferrerOnboarding({ ...VALID, siren: "552100554", email: "autre@x.fr", status: "active" }, SIREN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value)).not.toContain("siren");
  });

  it("téléphone et code postal invalides", () => {
    const r = parseReferrerOnboarding({ ...VALID, phone: "12", postal_code: "1100" }, SIREN);
    expect(r).toMatchObject({ ok: false, errors: { phone: expect.any(String), postal_code: expect.any(String) } });
  });
});
