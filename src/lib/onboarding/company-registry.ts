import "server-only";

import { isValidSiret, onlyDigits } from "@/lib/onboarding/identifiers";

/**
 * Données officielles (API Recherche d'entreprises, data.gouv — gratuite, sans clé).
 * Source d'autorité : elle confirme le SIRET lu sur le devis et fournit
 * raison sociale / adresse / dirigeant sans aucune saisie ni déduction du LLM.
 */
export type RegistryCompany = {
  siren: string;
  siret: string;
  name: string;
  addressLine1: string | null;
  postalCode: string | null;
  city: string | null;
  nafCode: string | null;
  firstName: string | null;
  lastName: string | null;
  active: boolean;
};

type ApiResult = {
  siren?: string;
  nom_complet?: string;
  nom_raison_sociale?: string;
  etat_administratif?: string;
  siege?: {
    siret?: string;
    numero_voie?: string | null;
    indice_repetition?: string | null;
    type_voie?: string | null;
    libelle_voie?: string | null;
    code_postal?: string | null;
    libelle_commune?: string | null;
    activite_principale?: string | null;
    etat_administratif?: string | null;
  };
  matching_etablissements?: { siret?: string; code_postal?: string | null; libelle_commune?: string | null; adresse?: string | null }[];
  dirigeants?: { type_dirigeant?: string; nom?: string | null; prenoms?: string | null }[];
};

const TYPE_VOIE: Record<string, string> = { RUE: "rue", AV: "avenue", BD: "boulevard", CHE: "chemin", IMP: "impasse", PL: "place", RTE: "route", ALL: "allée", LOT: "lotissement", QUA: "quai" };

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
}

export async function lookupCompanyBySiret(siret: string): Promise<RegistryCompany | null> {
  const digits = onlyDigits(siret);
  if (!isValidSiret(digits)) return null;
  try {
    const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${digits}&page=1&per_page=1`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: ApiResult[] };
    const r = json.results?.[0];
    if (!r || r.siren !== digits.slice(0, 9)) return null;

    const s = r.siege ?? {};
    const isHeadOffice = s.siret === digits;
    const etab = isHeadOffice ? null : r.matching_etablissements?.find((e) => e.siret === digits);
    const street = isHeadOffice
      ? [s.numero_voie, s.indice_repetition, s.type_voie ? (TYPE_VOIE[s.type_voie] ?? s.type_voie.toLowerCase()) : null, s.libelle_voie ? titleCase(s.libelle_voie) : null]
          .filter(Boolean)
          .join(" ")
      : null;
    const person = r.dirigeants?.find((d) => d.type_dirigeant === "personne physique");

    return {
      siren: digits.slice(0, 9),
      siret: digits,
      name: r.nom_complet ?? r.nom_raison_sociale ?? "",
      addressLine1: street || null,
      postalCode: (isHeadOffice ? s.code_postal : etab?.code_postal) ?? null,
      city: (isHeadOffice ? s.libelle_commune : etab?.libelle_commune) ? titleCase((isHeadOffice ? s.libelle_commune : etab?.libelle_commune)!) : null,
      nafCode: s.activite_principale ?? null,
      firstName: person?.prenoms ? titleCase(person.prenoms.split(" ")[0]!) : null,
      lastName: person?.nom ? titleCase(person.nom) : null,
      active: (r.etat_administratif ?? "A") === "A",
    };
  } catch {
    return null; // API indisponible : on n'invente rien, les champs restent à confirmer.
  }
}
