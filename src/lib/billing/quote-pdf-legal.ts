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

  // Bloquant (et non un simple avertissement) : exercer sans assurance décennale sur des
  // travaux qui y sont soumis est pénalement sanctionné (art. L243-3 C. assurances — jusqu'à
  // 6 mois d'emprisonnement et 75 000 € d'amende). Tant que "Facturer" reste gelé, le devis est
  // le seul document qui atteint réellement un client : il ne doit pas pouvoir partir sans cette
  // mention, à la différence de la facture où ce contrôle existait déjà (Vague 2, Temps 2).
  if (!profile.decennale_insurer?.trim() && !profile.decennale_policy_number?.trim()) {
    blocking.push("Assurance décennale non renseignée (Réglages → Mentions légales) — obligatoire pour ce type de travaux, sanction pénale en cas d'absence.");
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

export type QuoteRetractionNotice = {
  heading: string;
  body: string[];
};

/**
 * Droit de rétractation (art. L221-18 et s. du Code de la consommation) : s'applique quand le
 * devis est signé hors de l'établissement de l'artisan (domicile du client, chantier) — le cas
 * quasi systématique pour un artisan du bâtiment B2C. Le client dispose alors de 14 jours pour se
 * rétracter, et les travaux ne peuvent commencer avant l'expiration du délai sauf demande expresse
 * et signée du client (renonciation, art. L221-28 3°).
 *
 * On ne distingue pas B2B/B2C ici (le produit n'a aucun champ pour ça à ce jour) : la mention est
 * donc toujours affichée par défaut, ce qui est le choix le plus sûr juridiquement pour un
 * particulier — un artisan qui facture une entreprise peut ignorer cette section.
 */
export function buildQuoteRetractionLines(params: {
  profile: QuoteLegalProfile;
  retractionWaived: boolean;
}): QuoteRetractionNotice {
  const sellerName = params.profile.business_name?.trim() || "l'entreprise";
  const sellerAddress = [params.profile.addressLine1, [params.profile.postalCode, params.profile.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  if (params.retractionWaived) {
    return {
      heading: "EXÉCUTION IMMÉDIATE DES TRAVAUX — RENONCIATION AU DÉLAI DE RÉTRACTATION",
      body: [
        "Le client demande expressément la réalisation immédiate de la prestation avant l'expiration du délai de rétractation de 14 jours prévu à l'article L221-18 du Code de la consommation.",
        "Il reconnaît, conformément à l'article L221-28 3° du même code, qu'il perdra son droit de rétractation une fois la prestation pleinement exécutée.",
        "Date et signature du client pour cette renonciation expresse : ____ / ____ / ______     Signature :",
      ],
    };
  }

  return {
    heading: "DROIT DE RÉTRACTATION",
    body: [
      `Si ce devis est signé hors de l'établissement de ${sellerName} (domicile du client, chantier), le client dispose d'un délai de 14 jours à compter de sa signature pour se rétracter sans motif ni pénalité (art. L221-18 et s. du Code de la consommation). Les travaux ne peuvent commencer avant l'expiration de ce délai, sauf demande expresse et signée du client figurant sur ce devis.`,
      "Modèle de formulaire de rétractation (à compléter et renvoyer uniquement en cas de rétractation) :",
      `À l'attention de ${sellerName}${sellerAddress ? ` (${sellerAddress})` : ""} : je notifie par la présente ma rétractation du contrat portant sur la prestation ci-dessus.`,
      "Nom du client : ________________________     Date de signature du devis : ____ / ____ / ______",
      "Date et signature du client (en cas de notification sur papier) : ____ / ____ / ______",
    ],
  };
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
