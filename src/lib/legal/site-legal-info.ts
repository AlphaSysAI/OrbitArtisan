/** Informations légales de l'éditeur — source unique pour les pages juridiques. */

export const LEGAL_PUBLISHER = {
  /** Nom commercial. */
  companyName: "AlphaSysAI",
  /**
   * Dénomination de l'entrepreneur individuel : nom + mention « EI » obligatoire
   * sur tous les documents et sites depuis le 15 mai 2022 (art. R. 526-26 C. com.).
   */
  legalName: "Florian LAPERTOT EI",
  legalForm: "Entrepreneur individuel (micro-entreprise)",
  address: "4 Rue Barbès, 11700 Capendu, France",
  siren: "105815633",
  siret: "10581563300018",
  director: "Florian LAPERTOT",
  email: "contact@alphasys.tech",
  /**
   * Téléphone de l'éditeur : obligatoire (art. 6, III LCEN).
   * TODO(Florian) : renseigner avant mise en production — la ligne est masquée tant que vide.
   */
  phone: "",
  privacyEmail: "contact@alphasys.tech",
  /** Franchise en base de TVA (micro-entreprise). */
  vatMention: "TVA non applicable, art. 293 B du CGI",
  productName: "Soline",
  publicDomain: "solinebtp.fr",
  appDomain: "app.solinebtp.fr",
} as const;

export const LEGAL_HOST = {
  name: "Vercel Inc.",
  address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
  website: "https://vercel.com",
} as const;

export const LEGAL_SUBPROCESSORS = [
  { name: "Vercel", role: "Hébergement du site et de l'application (société américaine ; transferts encadrés par le Data Privacy Framework et les clauses contractuelles types)", website: "https://vercel.com" },
  { name: "Supabase", role: "Base de données, stockage de documents et authentification (Union européenne)", website: "https://supabase.com" },
  { name: "Mistral AI", role: "Traitement de texte par intelligence artificielle (qualification, assistant, devis) — France", website: "https://mistral.ai" },
  { name: "ElevenLabs", role: "Agent vocal et traitement de la voix (secrétaire Soline, formules Pro et Premium)", website: "https://elevenlabs.io" },
  { name: "Twilio", role: "Téléphonie : numéros, acheminement des appels de la secrétaire Soline", website: "https://www.twilio.com" },
  { name: "Tavily", role: "Recherche web de prix et de quantités de matériaux (aucune donnée client transmise volontairement)", website: "https://tavily.com" },
  { name: "Resend", role: "Envoi des e-mails transactionnels", website: "https://resend.com" },
  { name: "Stripe", role: "Paiement des abonnements et encaissements en ligne", website: "https://stripe.com" },
] as const;

export const LEGAL_LAST_UPDATED = "25 septembre 2026";
