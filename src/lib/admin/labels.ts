/**
 * Libellés de l'admin : jamais de valeur technique brute à l'écran (enum, clé d'audit).
 * Une valeur inconnue s'affiche telle quelle plutôt que d'être masquée.
 */

export type AdminSubscriptionStatus = "incomplete" | "trialing" | "active" | "past_due" | "canceled";

export const SUBSCRIPTION_LABEL: Record<AdminSubscriptionStatus, string> = {
  incomplete: "Sans formule",
  trialing: "Essai",
  active: "Abonné",
  past_due: "Impayé",
  canceled: "Résilié",
};

export const SUBSCRIPTION_HINT: Record<AdminSubscriptionStatus, string> = {
  incomplete: "Aucune formule souscrite : accès limité au choix de la formule.",
  trialing: "Essai avec carte enregistrée, prélèvement à la fin de l'essai.",
  active: "Abonnement payant en cours.",
  past_due: "Dernier prélèvement échoué : relance Stripe en cours.",
  canceled: "Abonnement terminé.",
};

export function subscriptionLabel(status: string | null | undefined): string {
  return SUBSCRIPTION_LABEL[status as AdminSubscriptionStatus] ?? status ?? "—";
}

const AUDIT_ACTION_LABEL: Record<string, string> = {
  "tenant.update": "Fiche artisan modifiée",
  "tenant.suspend": "Compte suspendu",
  "tenant.reactivate": "Compte réactivé",
  "tenant.archive": "Compte archivé",
  "tenant.restore": "Compte restauré",
  "tenant.plan_change": "Formule ou statut modifié",
  "tenant.reset_access": "Lien de réinitialisation généré",
  "tenant.voice_number": "Numéro Soline modifié",
  "tenant.voice_pool_assign": "Numéro attribué depuis le stock",
  "concierge.import": "Prospects importés",
  "concierge.interested": "Prospect intéressé (lien envoyé)",
  "concierge.invite": "Lien d'invitation prospect créé",
  "concierge.opt_out": "Prospect désinscrit",
  "concierge.unavailable": "Prospect pas disponible",
  "referrer.invite": "Apporteur invité",
  "referrer.invite_resend": "Invitation apporteur renvoyée",
  "referrer.invite_cancel": "Invitation apporteur annulée",
  "referrer.suspend": "Apporteur suspendu",
  "referrer.reactivate": "Apporteur réactivé",
  "voice_pool.provision": "Numéros achetés",
  "voice_pool.add": "Numéro ajouté au stock",
  "voice_pool.retire": "Numéro retiré du stock",
  "voice_pool.retry_elevenlabs": "Import ElevenLabs relancé",
  "telecom.lookup": "Consultation du registre télécom",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

export const AUDIT_CATEGORIES = [
  { id: "tenant", label: "Artisans" },
  { id: "concierge", label: "Conciergerie" },
  { id: "referrer", label: "Apporteurs" },
  { id: "voice_pool", label: "Numéros" },
  { id: "telecom", label: "Registre" },
] as const;

const ASSIGNED_BY_LABEL: Record<string, string> = {
  platform_admin: "admin Soline",
  subscription_auto: "automatique (abonnement)",
  artisan_self_service: "artisan",
};

const RELEASE_REASON_LABEL: Record<string, string> = {
  account_archived: "compte archivé",
  admin_removed: "retiré par l'admin",
  subscription_ended: "fin d'abonnement",
  reassigned_to_other_artisan: "réattribué à un autre artisan",
  mapping_insert_failed: "échec technique d'attribution",
};

export function assignedByLabel(value: string | null | undefined): string {
  return value ? (ASSIGNED_BY_LABEL[value] ?? value) : "—";
}

export function releaseReasonLabel(value: string | null | undefined): string {
  return value ? (RELEASE_REASON_LABEL[value] ?? value) : "—";
}
