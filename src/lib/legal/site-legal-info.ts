/** Informations légales de l'éditeur — source unique pour les pages juridiques. */

export const LEGAL_PUBLISHER = {
  companyName: "AlphaSysAI",
  legalForm: "Entreprise individuelle",
  address: "4 Rue Barbès, 11700 Capendu, France",
  siren: "105815633",
  siret: "10581563300018",
  director: "Florian LAPERTOT",
  email: "contact@alphasys.tech",
  privacyEmail: "contact@alphasys.tech",
  productName: "Soline",
  publicDomain: "solinebtp.fr",
  appDomain: "app.solinebtp.fr",
} as const;

export const LEGAL_HOST = {
  name: "o2switch",
  address: "222-224 Boulevard Gustave Flaubert, 63000 Clermont-Ferrand, France",
  siret: "510 909 807 00024",
  website: "https://www.o2switch.fr",
} as const;

export const LEGAL_SUBPROCESSORS = [
  { name: "Supabase", role: "Hébergement base de données et authentification (Union européenne)", website: "https://supabase.com" },
  { name: "o2switch", role: "Hébergement du site et de l'application", website: "https://www.o2switch.fr" },
  { name: "Mistral AI", role: "Traitement de texte par intelligence artificielle (qualification, assistant, devis)", website: "https://mistral.ai" },
  { name: "ElevenLabs", role: "Agent vocal intelligent et traitement de la voix (option Secrétariat IA)", website: "https://elevenlabs.io" },
  { name: "Stripe", role: "Paiements en ligne et encaissement", website: "https://stripe.com" },
] as const;

export const LEGAL_LAST_UPDATED = "14 août 2026";
