/** Mentions légales artisan pour PDF devis / factures. */
export type ArtisanLegalProfile = {
  business_name: string;
  name?: string | null;
  siren?: string | null;
  siret?: string | null;
  vat_number?: string | null;
  trade_register_number?: string | null;
  decennale_insurer?: string | null;
  decennale_policy_number?: string | null;
  rc_pro_insurer?: string | null;
  rc_pro_number?: string | null;
  mediator_name?: string | null;
  mediator_url?: string | null;
};

export function buildLegalMentionLines(profile: ArtisanLegalProfile): string[] {
  const lines: string[] = [];

  if (profile.siret) lines.push(`SIRET : ${profile.siret}`);
  else if (profile.siren) lines.push(`SIREN : ${profile.siren}`);

  if (profile.vat_number) lines.push(`N° TVA intracommunautaire : ${profile.vat_number}`);
  if (profile.trade_register_number) lines.push(`RCS / RM : ${profile.trade_register_number}`);

  if (profile.decennale_insurer || profile.decennale_policy_number) {
    const parts = [profile.decennale_insurer, profile.decennale_policy_number ? `n° ${profile.decennale_policy_number}` : null]
      .filter(Boolean)
      .join(" — ");
    lines.push(`Assurance décennale : ${parts}`);
  }

  if (profile.rc_pro_insurer || profile.rc_pro_number) {
    const parts = [profile.rc_pro_insurer, profile.rc_pro_number ? `n° ${profile.rc_pro_number}` : null]
      .filter(Boolean)
      .join(" — ");
    lines.push(`RC Pro : ${parts}`);
  }

  if (profile.mediator_name) {
    const med = profile.mediator_url
      ? `${profile.mediator_name} (${profile.mediator_url})`
      : profile.mediator_name;
    lines.push(`Médiateur de la consommation : ${med}`);
  }

  return lines;
}
