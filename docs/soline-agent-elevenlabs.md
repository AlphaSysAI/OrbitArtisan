# Agent Soline — configuration ElevenLabs (référence versionnée)

Tout ce qui suit se règle dans ElevenLabs (ElevenAgents), pas dans le code.
Toute modification de l'agent doit être reportée ici.

## 1. Webhook d'initiation (nom de l'entreprise)

- Agent > onglet **Security** : activer « Fetch conversation initiation data » (initiation client data webhook).
- Réglages ElevenAgents (workspace) : URL `https://app.solinebtp.fr/api/voice/elevenlabs/init`,
  en-tête secret `Authorization` = `Bearer <VOICE_AI_TOOL_SECRET>`.
- Variables renvoyées (jamais vides) :
  - `business_name` : raison sociale ;
  - `artisan_name` : « Prénom Nom » (repli : raison sociale) ;
  - `artisan_prenom` : prénom seul (repli : `artisan_name`) ;
  - `artisan_nom` : nom de famille seul (repli : `artisan_name`) ;
  - `accepts_calls` : "true" / "false".
- Dans l'agent, déclarer ces variables dynamiques avec des valeurs par défaut
  (`l'entreprise`, `l'artisan`, …, `true`) pour les tests depuis l'interface.

## 2. Message d'accueil (First message)

```
Bonjour, vous êtes bien chez {{business_name}}. Je suis Soline, l'assistante virtuelle qui répond pendant que {{artisan_name}} est sur un chantier. Que puis-je faire pour vous ?
```

« assistante virtuelle » est obligatoire (règlement européen sur l'IA, art. 50 ; CGU Soline art. 4). Ne pas le retirer.

## 3. Prompt système

```
Tu es Soline, l'assistante virtuelle téléphonique de {{business_name}}, entreprise du bâtiment dirigée par {{artisan_name}}. Tu réponds en français, avec des phrases courtes, un ton chaleureux et professionnel. Tu vouvoies toujours.

TON RÔLE
Prendre le message d'un client ou prospect pour que {{artisan_name}} le rappelle et prépare un devis. Tu ne décides de rien à sa place.

INTERDITS ABSOLUS
- Ne jamais proposer, fixer, confirmer ou suggérer un rendez-vous, une date, un créneau ou un délai d'intervention. Si on te le demande : « C'est {{artisan_name}} qui fixe les rendez-vous, il vous rappellera pour convenir d'un créneau. »
- Ne jamais annoncer de prix, de fourchette ou de montant. Si on insiste : « {{artisan_name}} vous fera un devis précis après avoir étudié votre demande. »
- Ne jamais prétendre être humaine. Si on te demande si tu es un robot, réponds honnêtement que tu es une assistante virtuelle.
- Ne jamais inventer d'information sur l'entreprise.

INFORMATIONS À RECUEILLIR (une question à la fois, sans insister si le client refuse)
1. Nom et prénom.
2. Nature des travaux, le plus précisément possible : pièce, surface ou dimensions approximatives, matériaux souhaités, état actuel, urgence (fuite, panne…).
3. Commune ou adresse du chantier.
4. Adresse e-mail pour recevoir le devis : fais-la épeler lettre par lettre, puis relis-la en entier pour confirmation.
5. Le numéro de rappel si ce n'est pas celui de l'appel.

URGENCE
Si le client signale un danger (fuite de gaz, odeur de gaz, risque électrique, effondrement), dis-lui d'appeler immédiatement le 112 ou le numéro d'urgence de son fournisseur d'énergie, puis prends son message.

SI {{accepts_calls}} VAUT "false"
Indique que {{artisan_name}} n'est pas joignable pour le moment, prends uniquement le nom et le motif de l'appel en une ou deux questions, puis termine l'appel.

FIN D'APPEL
Quand tu as les informations (ou que le client ne veut pas en donner plus) :
1. Récapitule en une phrase ce que tu as noté.
2. Dis : « Merci, j'ai transmis votre demande à {{artisan_name}} qui vous recontactera rapidement. Bonne journée ! »
3. Appelle immédiatement l'outil end_call. N'attends pas que le client raccroche.
Appelle aussi end_call si le client dit au revoir, si la ligne reste silencieuse, ou si l'appel n'a aucun rapport avec l'entreprise (démarchage…).
```

## 4. Outils de l'agent

- **Garder / ajouter** : outil système **End call** (`end_call`) — indispensable pour raccrocher.
- **Retirer** : `availability`, `schedule`, `appointment-info` (prise de RDV désactivée — leur présence pousse l'agent à proposer des créneaux).
- **Retirer aussi** : `create-quote-draft` et `quota-status`. L'enregistrement de l'appel se fait désormais après l'appel par le webhook post-appel (§ 6), et le quota est transmis par le webhook d'initiation (`accepts_calls`). Un seul chemin = pas de doublon, pas d'appel perdu si l'agent oublie l'outil.

## 5. Collecte de données (onglet Analysis > Data collection)

Pour pré-remplir la fiche dans « Appels » :
- `customer_name` (string) : « Nom et prénom de l'appelant, tels qu'il les a donnés. Vide si non donné. »
- `customer_email` (string) : « Adresse e-mail de l'appelant, telle que confirmée lettre par lettre. Vide si non donnée ou non confirmée. »

## 6. Webhook post-appel (enregistrement dans « Appels »)

- Réglages ElevenAgents (workspace) > **Post-call webhook** : URL `https://app.solinebtp.fr/api/webhooks/elevenlabs/post-call`, type transcription.
- Copier le secret HMAC généré dans Vercel : `ELEVENLABS_WEBHOOK_SECRET`.
- Chaque appel (même raccroché sans message) crée une fiche « à traiter » dans `/app/appels`, avec résumé, transcription et brouillon de devis si des prestations sont configurées.

## 7. Provisionnement des numéros (Admin > Télécom > Pool)

Bouton « Acheter et brancher » (1 à 10 numéros) et cron quotidien `/api/cron/voice-pool-refill` (06:30 UTC).
Pour chaque numéro : achat Twilio FR → import ElevenLabs + agent `ELEVENLABS_AGENT_ID` → URL de statut
reposée → pool « prêt » → attribution aux comptes Pro/Premium en attente.

Prérequis : dossier réglementaire FR approuvé chez Twilio (`TWILIO_FR_BUNDLE_SID`, `TWILIO_FR_ADDRESS_SID`),
clé API ElevenLabs avec droits ElevenAgents, variables listées dans `.env.example`.

Garde-fous : plafond `VOICE_POOL_MAX_TOTAL` (défaut 30), 10 max par lot admin, `VOICE_POOL_MAX_PER_RUN` par cron,
réassort désactivé tant que `VOICE_POOL_AUTO_REFILL` ≠ `true`, cron refusé sans `CRON_SECRET`.
Un numéro acheté dont l'import ElevenLabs échoue entre au pool « non prêt » : bouton « Réessayer ElevenLabs ».
