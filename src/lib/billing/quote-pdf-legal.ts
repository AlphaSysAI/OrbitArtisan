import { buildLegalMentionLines, type ArtisanLegalProfile } from "@/lib/billing/legal-mentions";
import { formatDateForPdf } from "@/lib/billing/pdf-text";

export type QuoteLegalProfile = Omit<ArtisanLegalProfile, "business_name"> & {
  business_name: string | null;
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
  email?: string | null;
};

export type QuoteLegalValidation = {
  ok: boolean;
  blocking: string[];
  warnings: string[];
};

/** Contrôle minimal avant envoi d'un devis à un client. */
export function validateQuoteLegalProfile(profile: QuoteLegalProfile): QuoteLegalValidation {
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (!profile.business_name?.trim()) {
    blocking.push("Raison sociale / nom commercial manquant (Réglages).");
  }
  if (!profile.siret?.trim() && !profile.siren?.trim()) {
    blocking.push("SIRET ou SIREN manquant (Réglements → Mentions légales).");
  }
  if (!profile.addressLine1?.trim() || !profile.postalCode?.trim() || !profile.city?.trim()) {
    blocking.push("Adresse professionnelle incomplète (Réglages).");
  }

  if (!profile.decennale_insurer?.trim() && !profile.decennale_policy_number?.trim()) {
    warnings.push("Assurance décennale non renseignée — obligatoire pour certains travaux du bâtiment.");
  }
  if (!profile.rc_pro_insurer?.trim() && !profile.rc_pro_number?.trim()) {
    warnings.push("Assurance RC Pro non renseignée.");
  }
  if (!profile.mediator_name?.trim()) {
    warnings.push("Médiateur de la consommation non renseigné (obligatoire B2C).");
  }
  if (!profile.vat_number?.trim()) {
    warnings.push("N° TVA intracommunautaire non renseigné (requis si assujetti).");
  }

  return { ok: blocking.length === 0, blocking, warnings };
}

export function buildQuotePdfFooterLines(params: {
  profile: QuoteLegalProfile;
  validUntil: Date;
  paymentTermsDays: number;
  generateVatAttestation?: boolean;
  vatAttestationNote?: boolean;
}): string[] {
  const lines: string[] = [];

  lines.push(
    `Validité du devis : ${formatDateForPdf(params.validUntil)} (durée maximale conforme aux usages — art. L112-1 et s. du Code de la consommation pour les devis remis aux particuliers).`,
  );
  lines.push(
    `Conditions de règlement : acompte et solde à convenir ; délai indicatif de paiement après facturation : ${params.paymentTermsDays} jours.`,
  );
  lines.push(
    "Les prix sont exprimés en euros hors taxes. TVA en sus au taux en vigueur applicable à chaque prestation.",
  );
  if (params.generateVatAttestation) {
    lines.push(
      "TVA à taux réduit : une attestation simplifiée (logement de plus de 2 ans) est jointe ou disponible sur demande — le client doit la signer avant exécution des travaux.",
    );
  }
  lines.push(
    "Acceptation : le client signe ci-dessous « Bon pour accord » avec la mention « Lu et approuvé, devis reçu avant exécution des travaux » et la date.",
  );
  lines.push(
    ...buildLegalMentionLines({
      ...params.profile,
      business_name: params.profile.business_name?.trim() || "Entreprise",
    }),
  );

  return lines;
}
