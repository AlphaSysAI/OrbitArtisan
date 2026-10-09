# Soline — grille comptée en appels, dépassement plafonné, prise de RDV (28/09/2026)

## Grille (source unique : `src/lib/billing/subscription-plans.ts`)

| Formule (id) | Mensuel HT | Annuel HT | Appels inclus | Hors forfait |
|---|---|---|---|---|
| Essentiel (`base`) | 49 € | 490 € | — | — |
| Pro (`pro`) | 99 € | 990 € | 40 | 0,90 € / appel |
| Premium (`premium`) | 149 € | 1 490 € | 100 | 0,70 € / appel |

- Un appel compte s'il est `completed` et dure ≥ 30 s (`voice_call_logs`). Quota calculé en lecture, mois civil.
- Au-delà du forfait : Soline continue jusqu'au plafond de l'artisan (`profiles.voice_overage_cap_cents`, 30 € par défaut, 0 possible). Plafond atteint → `mode = message_only` : Soline décroche toujours, prend un message, ne propose ni devis ni RDV. La ligne n'est jamais coupée.
- Dépassement du mois M facturé le 1er du mois M+1 par le cron `/api/cron/soline-billing` : invoice item + facture Stripe immédiate sur le moyen de paiement de l'abonnement (annuels compris). Idempotent (`voice_overage_charges`, clé d'idempotence Stripe).
- Recharges de minutes supprimées.
- Tarif ambassadeur inchangé (−25 % sur Pro/Premium) ; ne s'applique pas au hors forfait.

## Essai

- 30 jours sans CB sur la formule **Pro** : 10 appels, sans dépassement (message seul ensuite).
- Numéro attribué à la création du profil ; rendu à l'expiration (cron) s'il n'y a pas d'abonnement.
- Les profils déjà en essai Essentiel ne sont pas migrés.

## Numéros : quarantaine

Un numéro libéré passe en `quarantine` 30 jours avant réattribution (migration 39).

## Prise de RDV par Soline

- Plages de visite par jour (heure de Paris) + durée de visite : Réglages > Soline (`profiles.visit_hours`, `visit_duration_minutes`). Sans plage : pas de RDV vocal.
- `POST /api/voice/artisan/availability` → 3 créneaux libres (≥ 2 h après l'appel, 14 jours, étalés sur des jours différents), avec libellé oral.
- `POST /api/voice/artisan/schedule` → RDV `pending`, `source = voice`, `expires_at = +24 h`. Le créneau doit faire partie des créneaux libres recalculés ; la contrainte `appointments_no_overlap` tranche les réservations simultanées. E-mail facultatif, téléphone de l'appelant par défaut.
- Push artisan « à valider » → `/app/rdv?date=…`. À la validation : SMS de confirmation au client (`TWILIO_SMS_FROM`), une seule fois.
- Non validé sous 24 h : annulé (à la volée à chaque recherche de créneaux, et par le cron quotidien).

## Actions manuelles

1. Appliquer les migrations 37, 38, 39 (dans l'ordre).
2. Stripe : créer les 6 nouveaux prix (29/290, 69/690, 109/1 090) et les Payment Links, mettre à jour `STRIPE_PAYMENT_LINK_*`. Vérifier que le coupon ambassadeur (`applies_to`) couvre les nouveaux produits/prix. Renommer le produit Base en « Essentiel ».
3. Abonnés existants : décider s'ils restent sur l'ancien prix (grandfathering) ou migrent (préavis CGV).
4. ElevenLabs (agent) :
   - durée max d'appel : 480 s ;
   - variables dynamiques `soline_mode` (`full` / `message_only`) et `rdv_enabled` (`true` / `false`) ;
   - tool `availability` (body : `called_number`) et tool `schedule` (body : `called_number`, `customer_name`, `start_time` exact renvoyé par availability, `customer_phone` facultatif, `customer_email` facultatif, `address`, `description`) ;
   - prompt : ne proposer un RDV que si `rdv_enabled = true` ; annoncer « rendez-vous à confirmer par l'artisan, vous recevrez un SMS » ; en `message_only`, prendre seulement nom, numéro et besoin.
5. Twilio : `TWILIO_SMS_FROM` (numéro SMS ou expéditeur alphanumérique enregistré), `TWILIO_ACCOUNT_SID` déjà requis.
6. Vercel : le cron `/api/cron/soline-billing` (05:15 UTC) est ajouté dans `vercel.json`.
