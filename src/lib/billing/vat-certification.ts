/**
 * Certification du client pour les taux réduits de TVA dans les logements
 * (art. 279-0 bis et 278-0 bis A du CGI). Depuis le 1er mars 2025, elle remplace
 * l'attestation séparée (Cerfa) : elle figure sur le devis ou la facture et le
 * client la valide en acceptant. Rédaction libre admise par le BOFiP si elle
 * contient toutes les informations requises.
 */

export type VatCertificationScope = {
  /** Au moins une ligne à 10 % ou 5,5 %. */
  required: boolean;
  /** Au moins une ligne à 5,5 % (rénovation énergétique). */
  energy: boolean;
};

export function vatCertificationScope(rates: Iterable<number>): VatCertificationScope {
  let energy = false;
  let reduced = false;
  for (const r of rates) {
    if (r === 5.5) energy = true;
    if (r === 5.5 || r === 10) reduced = true;
  }
  return { required: reduced, energy };
}

/** Texte certifié par le client (devis, facture, case à cocher d'acceptation). */
export function vatCertificationLines(scope: VatCertificationScope, workSite?: string | null): string[] {
  if (!scope.required) return [];
  const place = workSite?.trim() ? `situés ${workSite.trim()}` : "objet du présent document";
  const lines = [
    `Pour bénéficier du taux réduit de TVA, le client certifie que les travaux portent sur des locaux ${place}, affectés ou destinés à l'habitation (y compris leurs dépendances et parties communes), achevés depuis plus de deux ans à la date de début des travaux.`,
    "Il certifie également que, sur une période de deux ans, ces travaux ne concourent pas à la production d'un immeuble neuf au sens de l'article 257 du CGI et n'augmentent pas de plus de 10 % la surface de plancher des locaux existants.",
  ];
  if (scope.energy) {
    lines.push(
      "Pour les lignes au taux de 5,5 %, le client certifie que les travaux sont des travaux d'amélioration de la qualité énergétique, ou des travaux induits qui leur sont indissociablement liés, au sens de l'article 278-0 bis A du CGI.",
    );
  }
  lines.push(
    "Si ces mentions s'avèrent inexactes du fait du client, celui-ci est solidairement tenu au paiement du complément de TVA. Le client conserve ce document et les factures correspondantes jusqu'au 31 décembre de la cinquième année suivant la réalisation des travaux.",
  );
  return lines;
}

/** Libellé de la case à cocher lors de l'acceptation en ligne. */
export const VAT_CERTIFICATION_CHECKBOX =
  "Je certifie l'exactitude des conditions d'application du taux réduit de TVA indiquées sur le devis (logement de plus de deux ans, pas de construction neuve ni d'agrandissement de plus de 10 %).";
