# Agent Soline — configuration ElevenLabs (référence versionnée)

Tout ce qui suit se règle dans ElevenLabs (ElevenAgents), pas dans le code.
Toute modification de l'agent doit être reportée ici.

## 1. Webhook d'initiation

- Agent > onglet **Security** : activer « Fetch conversation initiation data » (initiation client data webhook).
- Réglages ElevenAgents (workspace) : URL `https://app.solinebtp.fr/api/voice/elevenlabs/init`,
  en-tête secret `Authorization` = `Bearer <VOICE_AI_TOOL_SECRET>`.
- ElevenLabs envoie `caller_id`, `agent_id`, `called_number`, `call_sid`, `conversation_id`. Le webhook :
  - résout l'artisan par `called_number` ;
  - enregistre la session d'appel (`voice_call_sessions` : `conversation_id` → artisan, heure de début ;
    migration 63). Échec d'écriture = journalisé, l'appel continue ;
  - répond toujours HTTP 200 (repli sur des valeurs par défaut en cas d'erreur).
- Réponse : `type: "conversation_initiation_client_data"`, `dynamic_variables` et, selon le cas,
  `conversation_config_override.agent` (`first_message`, `prompt.prompt`).
- **Règle ElevenLabs** : `dynamic_variables` doit contenir TOUTES les variables déclarées dans l'agent ; un override
  envoyé pour un champ non autorisé dans Security › Overrides **fait échouer la conversation**
  (« an error will be thrown »). D'où l'ordre d'activation du § 8.
- Variables renvoyées (jamais vides, repli compris) :
  `business_name`, `artisan_name`, `artisan_prenom`, `artisan_nom`, `artisan_metier`, `artisan_domaine`,
  `artisan_prestations`, `artisan_zone`, `accepts_calls`, `soline_mode`, `rdv_enabled`, `number_active`,
  `timezone`, `prompt_version`, `current_date_label`, `current_time_label`.
  - `soline_mode` : "full" / "message_only" (forfait et plafond atteints, ou essai épuisé) ;
  - `rdv_enabled` : "true" si plages de visite ouvertes et `soline_mode` = "full" ;
  - `number_active` : "false" si le numéro n'est plus rattaché (le webhook remplace alors le message d'accueil
    par « Ce numéro n'est plus en service… » → override **First message** obligatoire).
- Les déclarer dans l'agent avec une valeur par défaut (tests depuis l'interface).
- Onglet **Advanced** : *Max conversation duration* = **480 s** (garde-fou de coût, CGV). Ne pas augmenter.

## 2. Message d'accueil et prompt système — source : le code

Le texte fait foi dans `src/lib/voice/soline-agent-prompt.ts` (`SOLINE_FIRST_MESSAGE`, `SOLINE_SYSTEM_PROMPT`,
`SOLINE_AGENT_PROMPT_VERSION`, journalisée dans `voice_call_intakes.call_report.meta`).

Accueil (version 2026-10-09.2) : « Bonjour, je suis Soline, l'assistante IA de {{business_name}}.
{{artisan_prenom}} ne peut pas vous répondre pour le moment. Que puis-je faire pour vous ? »
Annonce d'une IA dès la première phrase (règlement européen sur l'IA, art. 50 ; CGU Soline art. 4). Le nom vient
toujours du profil ; à défaut : « l'entreprise ».

Deux modes :
- **Override (recommandé)** — `SOLINE_AGENT_PROMPT_OVERRIDE=1` + Security › Overrides **First message** et
  **System prompt** autorisés. Le prompt et l'accueil du code sont injectés à chaque appel.
- **Override désactivé** (drapeau absent) : ElevenLabs utilise le prompt et l'accueil saisis dans l'agent. Les
  variables dynamiques restent envoyées. Il faut alors recopier `SOLINE_FIRST_MESSAGE` et `SOLINE_SYSTEM_PROMPT`
  à chaque changement de version, sinon l'ancienne annonce et les anciennes règles (sans `replaces_appointment_id`)
  restent en service.

## 3. Outils de l'agent (webhooks)

En-tête `Authorization: Bearer <VOICE_AI_TOOL_SECRET>`, POST JSON, *Response timeout* 10 s.

**Règle de sécurité** : `called_number`, `caller_number` et `conversation_id` sont de type **Dynamic variable**
(champ `dynamic_variable` de l'API), jamais *LLM prompt*. Sinon le modèle — ou un appelant qui le manipule —
pourrait viser un autre numéro, donc un autre artisan. Le serveur rejette en plus une conversation enregistrée pour
un autre artisan que le numéro appelé (`unverified_call`).

### `availability` → `https://app.solinebtp.fr/api/voice/artisan/availability`

| Paramètre | Type de valeur | Valeur / description |
|---|---|---|
| `called_number` | Dynamic variable | `system__called_number` |
| `conversation_id` | Dynamic variable | `system__conversation_id` |
| `preferred_date` | LLM, facultatif | « Date souhaitée par le client au format AAAA-MM-JJ, calculée depuis la date du jour. Vide sinon. » |
| `part_of_day` | LLM, facultatif, enum `matin`, `apres-midi` | « Moment souhaité. Vide sinon. » |

Réponse : `slots[]` (`start_time`, `label`), `matched_preference`, `timezone`, éventuellement `message`, et
`call_time` (`elapsed_secs`, `remaining_secs`, `closing_instruction` une seule fois après 420 s).

### `schedule` → `https://app.solinebtp.fr/api/voice/artisan/schedule`

| Paramètre | Type de valeur | Valeur / description |
|---|---|---|
| `called_number` | Dynamic variable | `system__called_number` |
| `caller_number` | Dynamic variable | `system__caller_id` |
| `conversation_id` | Dynamic variable | `system__conversation_id` |
| `customer_name` | LLM, requis | « Nom du client tel qu'il l'a donné. » |
| `start_time` | LLM, requis | « start_time EXACT d'un créneau renvoyé par availability. » |
| `customer_phone` | LLM, facultatif | « Numéro de rappel s'il diffère du numéro appelant, relu au client. » |
| `customer_email` | LLM, facultatif | « E-mail épelé et relu. » |
| `address` | LLM, facultatif | « Adresse du chantier relue au client. » |
| `description` | LLM, facultatif | « Besoin en une phrase. » |
| `replaces_appointment_id` | LLM, facultatif | « appointment_id reçu plus tôt dans CET appel, uniquement si le client déplace ce rendez-vous. » |
| `additional_visit` | LLM, facultatif, enum `true`, `false` | « true seulement si le client demande une seconde visite pour un autre besoin. » |

Réponses :
- `ok: true`, `status: "pending_validation"`, `appointment_id`, `label`. Plus `already_booked` (rejeu) ou
  `previous_label` (déplacement : même rendez-vous, ancien créneau libéré).
- `ok: false` + `message` à suivre, avec `error` parmi :
  - `slot_unavailable` (ancien rendez-vous conservé) ;
  - `existing_booking` : rien n'est réservé, question « déplacer ou seconde visite ? » à poser ;
  - `replace_not_found`, `appointment_locked` : rendez-vous déjà traité par l'artisan ;
  - `change_unavailable` : conversation non vérifiable ;
  - `unverified_call`, `message_only`, `booking_not_configured`, `missing_fields`, `server_error`.

Identité d'une opération : artisan (numéro appelé) + conversation vérifiée (`voice_call_sessions`) + créneau.
L'arbitrage se fait en base, dans une transaction (`voice_book_appointment`) :
- rejeu après timeout → aucun doublon ;
- déplacement → uniquement le rendez-vous en attente de cette conversation ;
- deux conversations sur le même créneau → contrainte d'exclusion.

Sans `conversation_id` vérifiable : création simple, jamais de modification ni d'annulation ; un rejeu après timeout
peut alors répondre `slot_unavailable`.

- **Garder** : outil système **End call** (`end_call`).
- **Retirer** : `appointment-info`, `create-quote-draft` et `quota-status`.

## 4. Clôture avant 480 s — ce qui est possible avec l'intégration Twilio native

- La documentation ElevenLabs ne prévoit **aucun moyen côté serveur d'injecter un message dans un appel téléphonique
  en cours** :
  - le webhook d'initiation ne sert qu'au démarrage ;
  - `contextual_update` est un événement client documenté sur une connexion WebSocket que nous ne tenons pas en
    intégration Twilio native ;
  - *Max conversation duration* coupe sans préavis.
- Mécanisme retenu (officiel) : chaque réponse d'outil contient `call_time`, calculé sur l'horloge serveur depuis
  l'initiation (donc légèrement surestimé, ce qui est prudent). Après 420 s, la première réponse d'outil contient
  `closing_instruction` (une seule fois, marquée en base). Le prompt demande d'appliquer cette consigne et donne un
  ordre de priorité pour conclure.
- Limite : sans appel d'outil après 420 s, aucun signal n'arrive. La coupure à 480 s reste le garde-fou.
- Alternative possible, plus lourde : un pont WebSocket maison (Twilio Media Streams ↔ ElevenLabs) pour envoyer un
  `contextual_update` à 420 s. Cela demande un service persistant hors Vercel ; non retenu pour l'instant.
- La session est supprimée par le webhook post-appel et purgée par le cron quotidien (`/api/cron/soline-billing`)
  après 24 h si le post-appel n'arrive jamais.

## 5. Collecte de données (onglet Analysis > Data collection)

Pour pré-remplir la fiche dans « Appels » :
- `customer_name` (string) : « Nom et prénom de l'appelant, tels qu'il les a donnés. Vide si non donné. »
- `customer_email` (string) : « Adresse e-mail de l'appelant, telle que confirmée lettre par lettre. Vide si non donnée ou non confirmée. »

## 6. Webhook post-appel (enregistrement dans « Appels »)

- Réglages ElevenAgents (workspace) > **Post-call webhook** : URL `https://app.solinebtp.fr/api/webhooks/elevenlabs/post-call`, type transcription.
- Copier le secret HMAC généré dans Vercel : `ELEVENLABS_WEBHOOK_SECRET`.
- Chaque appel (même raccroché sans message) crée une fiche « à traiter » dans `/app/appels` : compte rendu structuré, transcription, brouillon de devis seulement pour une demande de travaux explicite, y compris dans un suivi de chantier ou une question sur un devis (jamais pour démarchage / fournisseur). Besoin ambigu ou analyse indisponible : pas de brouillon, besoin conservé dans le compte rendu et validation demandée à l'artisan.
- Rejeu du webhook (même `call_sid`) : fiche existante renvoyée, sans nouvelle analyse, chiffrage ni notification.
- Fin de session d'appel (`voice_call_sessions`) à réception.

## 7. Numéros Soline à la demande

1 abonnement Pro/Premium validé = 1 numéro. Déclencheur : webhook Stripe (abonnement `active`, `past_due`
ou `trialing` avec carte enregistrée). Le webhook répond immédiatement ; l'achat s'exécute juste après
(`after`) : achat Twilio FR → import ElevenLabs + agent `ELEVENLABS_AGENT_ID` → URL de statut reposée →
attribution. Verrou par artisan (`profiles.voice_number_provisioning_at`) : jamais 2 achats.

- Essai sans carte : pas de numéro. « Activer mon numéro Soline » → Checkout avec essai Stripe
  jusqu'à la fin de l'essai (0 € aujourd'hui).
- Résiliation / passage en Base : quarantaine 30 jours (message « n'est plus attribué »), puis
  restitution à Twilio (cron). Réabonnement pendant la quarantaine : l'artisan récupère SON numéro.
- Échec (Twilio, ElevenLabs, plafond) : artisan en attente, e-mail `ADMIN_ALERT_EMAIL`, relance au cron
  quotidien `/api/cron/voice-pool-refill` (06:30 UTC).
- Admin > Télécom > Pool : achat manuel (1 à 10) pour dépanner uniquement.

Prérequis : dossier réglementaire FR approuvé chez Twilio (`TWILIO_FR_BUNDLE_SID`, `TWILIO_FR_ADDRESS_SID`,
`TWILIO_FR_NUMBER_TYPE`), clé API ElevenLabs avec droits ElevenAgents, variables de `.env.example`.

Garde-fous : coupe-circuit `VOICE_POOL_MAX_TOTAL` (défaut 30, alerte e-mail à 80 %), 10 max par lot admin,
cron refusé sans `CRON_SECRET`.
Un numéro acheté dont l'import ElevenLabs échoue entre au pool « non prêt » : bouton « Réessayer ElevenLabs ».

## 8. Mise en production de la tranche IA (ordre, vérification, retour arrière)

Ne rien activer en production sans avoir déroulé les étapes 1 à 4 sur l'agent de test.

1. **Migrations** (SQL Supabase), dans l'ordre : 57 → 63, en particulier :
   - **62** (`call_report`) ;
   - **63** (`voice_call_sessions`, `appointments.voice_conversation_id`, `voice_book_appointment`, `voice_mark_closing_signal`).

   Elles sont rejouables. Vérification locale : `SOLINE_PG_TEST=1 bash supabase/tests/voice-booking-identity.sh`.
2. **Code** : déployable avant ou après les migrations.
   - Sans 62 : page Appels sans compte rendu, appels enregistrés sans `call_report`.
   - Sans 63 : réservation simple (pas de rejeu idempotent ni de déplacement), sans `call_time`.
3. **ElevenLabs** (agent de test d'abord) :
   - déclarer `timezone`, `prompt_version`, `current_date_label`, `current_time_label` dans les variables ;
   - mettre à jour les deux outils (§ 3), avec les trois paramètres *Dynamic variable* ;
   - Security › Overrides : autoriser **First message** et **System prompt**.
4. **Vercel** :
   - `SOLINE_AGENT_PROMPT_OVERRIDE=1` seulement après l'étape 3 (sinon les appels échouent) ;
   - `SOLINE_REQUIRE_VERIFIED_CALL=1` seulement après un appel de test qui montre une session vérifiée.

### Procédure de vérification (agent de test, numéro de test)

- **Accueil** : la première phrase entendue est « je suis Soline, l'assistante IA de <raison sociale> ».
- **Prompt** : dans ElevenLabs › Conversations › détail, vérifier les variables dynamiques reçues (`prompt_version` =
  version du code).
- **Session** : `select * from voice_call_sessions` pendant l'appel → une ligne avec le `conversation_id` de
  l'appel. Après l'appel, la ligne disparaît.
- **Réservation** : réserver un créneau, puis le déplacer. Contrôler qu'un seul RDV pending reste, avec le même
  `id` et le `voice_conversation_id` de l'appel.
- **Seconde visite** : demander une seconde visite → question posée, puis 2 RDV.
- **Rejeu** : rejouer la requête `schedule` à l'identique (curl avec le secret) → `already_booked`.
- **Clôture** : prolonger un appel au-delà de 7 min avec une demande de créneau → `closing_instruction` dans la
  réponse d'outil (onglet Tools de la conversation) ; l'appel se termine avant 480 s.
- **Fiche Appels** : compte rendu affiché, RDV « en attente de ta validation ».

### Retour arrière

- **Prompt et accueil** : retirer `SOLINE_AGENT_PROMPT_OVERRIDE` → ElevenLabs reprend le prompt saisi dans l'agent.
  Laisser les overrides autorisés ne gêne pas.
- **Mode strict** : retirer `SOLINE_REQUIRE_VERIFIED_CALL`.
- **Outils** : revenir à l'ancienne configuration. Le serveur accepte un corps sans `conversation_id` (création simple).
- **Migrations 62 et 63** : aucune suppression nécessaire, le code précédent ignore les nouvelles colonnes et
  fonctions. Ne pas supprimer `voice_conversation_id` tant que des RDV en attente l'utilisent.

### Écarts relevés avec la documentation ElevenLabs

- Override envoyé sans autorisation dans Security → **erreur et échec de la conversation**, pas un simple refus du
  champ. L'ancien commentaire du code (« refusé ») sous-estimait l'impact.
- `dynamic_variables` doit contenir toutes les variables déclarées dans l'agent. Les nouvelles variables sont
  renvoyées dans tous les cas (repli et numéro inactif compris).
- `called_number` des outils documenté « = `{{system__called_number}}` » sans préciser le type de valeur : il doit
  être *Dynamic variable*, sinon la résolution de l'artisan dépend du modèle.
- Le délai de réponse des webhooks d'outils est de 20 s par défaut (5 à 300 s). Viser 10 s : le serveur coupe
  Mistral à 20 s, mais les outils de RDV n'appellent pas le modèle.
- Non documenté, à vérifier pendant l'appel de test : la mise à jour de `system__call_duration_secs` dans le prompt
  système au fil de l'appel. Le mécanisme retenu ne dépend pas de ce point.
