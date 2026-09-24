# Intégrations externes

Document de contexte factuel, dérivé du code (`src/lib/billing/`, `src/lib/recovery/`, `src/lib/services/`, `src/app/api/`).  
Les secrets ne sont jamais affichés ici — seuls les **noms** de variables d'environnement.

---

## 1. Factur-X (CII / PDF/A-3)

### Profils supportés

| Profil code | URN guideline | Validation StackForge | Usage |
|-------------|---------------|----------------------|--------|
| `en16931` | `urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931` | `Profile.EN16931` | **Défaut** à la finalisation B2B et soumission PA |
| `basic` | `urn:factur-x.eu:1p0:basic` | `Profile.BASIC` | Téléchargement API (`?profile=basic`) |

**Non implémentés** : `minimum`, `basicwl`, `extended` (noms FNFE distincts).

Différence fonctionnelle : le profil `en16931` inclut e-mail / téléphone du vendeur dans `definedTradeContact` ; `basic` ne les sérialise pas.

### Pipeline

```
invoices + invoice_lines + profiles + customer_profiles
  → loadFacturXDocumentFromDb
  → buildCrossIndustryInvoice (CII D22B)
  → crossIndustryInvoiceToXml
  → validateFacturXXml (XSD StackForge, sauf FACTURX_SKIP_STACKFORGE=1)
  → renderInvoicePdf + embedFacturXInPdf (pièce jointe factur-x.xml)
```

### Mapping champs clés (DB → CII)

| Source | Cible CII / PDF |
|--------|-----------------|
| `invoices.invoice_number` | `exchangedDocument.id`, type `380` |
| `invoices.created_at` | `issueDateTime` (format 102 `YYYYMMDD`) |
| `invoices.notes` | `includedNote` |
| `profiles.*` (seller) | `sellerTradeParty` : nom, SIREN (`0002`), SIRET (`0009`), TVA, adresse, RCS |
| `customer_profiles.*` + `invoices.customer_name/email` | `buyerTradeParty` |
| `invoice_lines.label` | `specifiedTradeProduct.name` |
| `invoice_lines.quantity` | `billedQuantity` (unité `C62`) |
| `invoice_lines.line_total` (centimes HT) | `lineTotalAmount`, prix unitaire dérivé |
| `invoice_lines.vat_rate` | `rateApplicablePercent` |
| `invoice_lines.vat_category_code` (déf. `S`) | `categoryCode` |
| `invoice_lines.vat_exemption_reason` | `exemptionReason` si TVA 0 |

Totaux CII : somme HT lignes + TVA arrondie par ligne → `grandTotalAmount` / `duePayableAmount`.

### Route de téléchargement

- **GET** `/api/invoices/[invoiceId]/factur-x?profile=basic|en16931`
- Auth : artisan propriétaire ou client lié (brouillon interdit côté client)
- Erreur validation : **422** `{ error: "facturx_validation_failed" }`

**Fichiers** : `src/lib/billing/facturx/` (`load-from-db.ts`, `build-cii-invoice.ts`, `generate-factur-x.ts`, `validate-factur-x.ts`).

---

## 2. Plateforme Agréée (PA) — facturation électronique B2B

### Configuration

| Variable | Rôle |
|----------|------|
| `PA_PROVIDER` | `noop` (défaut) \| `pennylane` \| `http` \| `docaposte` \| `confactura` |
| `PA_API_KEY` | Bearer token soumission |
| `PA_API_URL` | URL endpoint (obligatoire pour `http` / `docaposte` / `confactura`) |
| `PA_WEBHOOK_SECRET` | HMAC webhooks entrants |
| `PA_RETRY_ATTEMPTS` | Retries soumission (défaut `3`) |

### Soumission sortante

Déclenchée à la **finalisation** d'une facture B2B (`InvoiceService.finalize` → flux `e_invoicing`).

| Provider | Comportement |
|----------|--------------|
| `noop` | Aucun appel réseau |
| `pennylane` | POST PDF vers API Pennylane e-invoices (URL par défaut Pennylane ou `PA_API_URL`) |
| `http`, `docaposte`, `confactura` | POST `multipart/form-data` : `file`, `pdf`, `xml`, `metadata` JSON (`format: "factur-x"`, `profile: "en16931"`) |

**Payload** (`PaSubmissionPayload`) : `invoiceId`, `invoiceNumber`, `facturXPdf`, `facturXXml`, `seller`/`buyer` (name, siren, siret, vatNumber).

**Statut soumission** (`pa_submission_status`) : `queued` \| `accepted` \| `rejected`.

**Retry** : HTTP 5xx, `fetch failed`, `ECONNRESET`, `ETIMEDOUT` — backoff `800ms × attempt`.

**Fichiers** : `src/lib/billing/invoicing/create-invoice-service.ts`, `adapters/http-payload-submitter.ts`, `adapters/pennylane-payload-submitter.ts`, `adapters/retry-payload-submitter.ts`.

### Webhook entrant PA

| | |
|---|---|
| **Route** | `POST /api/webhooks/facturation-electronique` |
| **Auth** | En-tête `x-pa-signature` — HMAC-SHA256 du corps brut (`PA_WEBHOOK_SECRET`) |
| **Réponses** | 401 signature, 400 JSON/payload, 404 facture, 503 secret manquant, 200 `{ ok, invoiceId, fiscalStatus }` |

**Payload attendu** (Zod `PaWebhookPayloadSchema`) :

```json
{
  "event": "RECEIVED_BY_PLATFORM | TRANSMITTED | APPROVED | ACCEPTED | REJECTED | REFUSED | PAYMENT_RECEIVED",
  "submissionId": "string (optionnel si invoiceId présent)",
  "invoiceId": "uuid (optionnel si submissionId présent)",
  "occurredAt": "ISO8601",
  "rejectionReason": "string",
  "rejectionCode": "string",
  "paymentAmountCents": 0,
  "currency": "EUR"
}
```

**Mapping événement → `e_invoicing_status`** :

| Événement PA | Statut fiscal BDD |
|--------------|-------------------|
| `RECEIVED_BY_PLATFORM` | `RECEIVED_BY_PLATFORM` |
| `TRANSMITTED` | `TRANSMITTED` |
| `APPROVED`, `ACCEPTED` | `APPROVED` |
| `REJECTED`, `REFUSED` | `REJECTED` (+ motif) |
| `PAYMENT_RECEIVED` | `PAID` (+ `invoices.status = paid` si `sent`) |

**Idempotence / erreurs** : pas de déduplication explicite ; rejeu = mise à jour facture. Journal `pa_webhook_events` (insert non bloquant). Alerte log si montant encaissement ≠ `grand_total`.

---

## 3. E-reporting B2C

Flux distinct de la PA B2B : clients sans SIREN+TVA valides (`classifyCustomer`).

| Variable | Rôle |
|----------|------|
| `E_REPORTING_PROVIDER` | Fallback sur `PA_PROVIDER` si vide |
| `E_REPORTING_API_URL` | POST JSON lot groupé |
| `E_REPORTING_API_KEY` | Fallback sur `PA_API_KEY` |

**Déclenchement** : finalisation B2C → insert `e_reporting_queue` (`status: pending`).

**Cron** : **GET** `/api/cron/e-reporting` — auth `Authorization: Bearer ${CRON_SECRET}` (Vercel, ex. `0 3 * * *`).

**Soumission** : lots par `artisan_id` + `reporting_period` (1er du mois), payload `schemaVersion: "1.1"`.

**Statuts file** (`e_reporting_queue.status`) : `pending` → `batched` → `submitted` \| `failed`.

**Pas de webhook e-reporting** dans le code.

**Fichiers** : `src/lib/billing/invoicing/e-reporting.ts`, `e-reporting-submitter.ts`, `run-e-reporting.ts`.

---

## 4. Recouvrement — MySendingBox / La Poste (LRAR)

### API sortante

| Variable | Rôle |
|----------|------|
| `MYSENDINGBOX_API_KEY` | Auth Basic (`base64(key:)`) |
| `MYSENDINGBOX_WEBHOOK_SECRET` | Secret partagé callbacks |

Base : `https://api.mysendingbox.fr` — **POST** `/letters` (`postage_type: lrar`).

**Idempotence API** : en-tête `Idempotency-Key` (ex. `formal_notices.id`).

**Fichiers** : `src/lib/services/mysendingbox.ts`, `src/app/app/invoices/recovery-actions.ts`.

### Webhook entrant

| | |
|---|---|
| **Route** | `POST /api/webhooks/mysendingbox` |
| **Auth** | `x-webhook-secret` ou `?secret=` (pas de HMAC MySendingBox) |

**Payload** : `{ event: { name, letter?, ... }, letter?: { _id, tracking_number, filing_proof, delivery_proof, ... } }`.

**Événements `letter.*` gérés** : `created`, `accepted`, `filing_proof`, `sent`, `in_transit`, `waiting_to_be_withdrawn`, `distributed`, `delivery_proof`, `returned_to_sender`, `return_to_sender_proof`, `wrong_address`, `error`, `lost`, `canceled`.

**Statuts internes** (`formal_notices.status`) : `pending` → `sent` → `in_transit` → `waiting_withdrawal` → `delivered` / `returned` / `wrong_address` / `failed` / `canceled`.

**Idempotence** : `shouldApplyStatus` — ordre monotonic (`STATUS_RANK`) : un webhook tardif ne fait pas régresser le statut. Événement inconnu → **200** `{ ignored: true }` (MySendingBox rejoue 8× sur non-200).

Preuves La Poste téléchargées et archivées dans le bucket recouvrement (échec non bloquant).

---

## 5. Recouvrement — RubyPayeur

### API sortante

| Variable | Rôle |
|----------|------|
| `RUBYPAYEUR_API_URL` | Base API |
| `RUBYPAYEUR_API_KEY` | Bearer |
| `RUBYPAYEUR_PARTNER_ID` | `partner_reference` |
| `RUBYPAYEUR_COMMISSION_RATE` | Rétrocession honoraires (défaut `0.2`) |
| `RUBYPAYEUR_WEBHOOK_SECRET` | HMAC webhooks |

**POST** `{API_URL}/recovery-cases` — `externalReference` = `invoice.id`, documents via URLs signées.

**Statuts dossier** : `submitted` \| `accepted` \| `in_progress` \| `partially_collected` \| `collected` \| `failed` \| `canceled`.

### Webhook entrant

| | |
|---|---|
| **Route** | `POST /api/webhooks/rubypayeur` |
| **Auth** | `x-rubypayeur-signature` ou `x-signature` — HMAC-SHA256 corps brut |

**Payload** :

```json
{
  "event": "case.accepted | case.in_progress | case.partially_collected | case.collected | case.failed | case.canceled",
  "occurred_at": "ISO8601",
  "case_id": "string",
  "external_reference": "uuid facture",
  "status": "string",
  "amount_collected": 0,
  "fee": 0,
  "failure_reason": "string"
}
```

(`case_id` **ou** `external_reference` requis.)

**Mapping → `invoices.recovery_status`** : `submitted_to_collection` \| `in_progress` \| `collected` \| `failed`.

`case.collected` → `invoices.status = paid`. Commission partenaire calculée sur `fee`.

Événement inconnu → **200** `{ ignored: true }`.

**Fichiers** : `src/lib/services/rubypayeur.ts`, `src/lib/recovery/process-rubypayeur-webhook.ts`.

---

## 6. Stripe

### Variables

| Variable | Rôle |
|----------|------|
| `STRIPE_SECRET_KEY` | API Stripe |
| `STRIPE_WEBHOOK_SECRET` | Signature webhooks |

Utilisées dans le code mais **absentes de `.env.example`** : `STRIPE_PAYMENT_LINK_*` (6 liens abonnement base/pro/premium mensuel/annuel).

### Usages

| Flux | Mécanisme |
|------|-----------|
| Abonnement SaaS artisan | Payment Links + Billing Portal |
| Paiement facture client | Checkout Session `mode: payment` + Connect (`metadata.invoice_id`) |
| Connect Express | `account.updated` → sync capacités transfert |

### Webhook entrant

| | |
|---|---|
| **Route** | `POST /api/webhooks/stripe` |
| **Auth** | En-tête `stripe-signature` + `STRIPE_WEBHOOK_SECRET` |

**Événements traités** :

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Abo SaaS ou facture client payée |
| `checkout.session.async_payment_succeeded` | Facture client payée |
| `customer.subscription.created/updated` | Sync `profiles` abonnement |
| `customer.subscription.deleted` | Annulation abo |
| `invoice.payment_failed` | `subscription_status: past_due` |
| `invoice.paid` | Resync abonnement |
| `account.updated` | Sync Connect (`stripe_transfers_enabled`, `stripe_payouts_enabled`) |

**Idempotence** :
- Facture client : skip si déjà `paid` ; vérif `grand_total === amount_total`
- Events SaaS : upsert `stripe_billing_events` `onConflict: stripe_event_id, ignoreDuplicates: true`

**Statuts abonnement profil** : `active` \| `past_due` \| `canceled` \| `trialing`. Plans : `base`, `pro`, `premium`.

---

## 7. Voix — Twilio & ElevenLabs

### Twilio (webhook entrant)

| Variable | Rôle |
|----------|------|
| `TWILIO_AUTH_TOKEN` | Validation signature |
| `TWILIO_STATUS_CALLBACK_URL` | URL callback explicite (optionnel) |

| | |
|---|---|
| **Route** | `POST /api/webhooks/twilio/status` |
| **Auth** | `X-Twilio-Signature` sur corps `application/x-www-form-urlencoded` |
| **Champs** | `CallSid`, `CallStatus`, `CallDuration`, `From`, `To` |
| **Réponse** | TwiML vide (200) |

**Facturation minutes** : `completed` → minutes arrondies au supérieur ; `no-answer` / `busy` / `failed` → 0 min.

**Idempotence** : RPC `process_twilio_voice_call_status` — `ON CONFLICT (twilio_call_sid) DO NOTHING`.

### ElevenLabs (tools REST entrants)

Agent vocal hébergé ElevenLabs appelle les endpoints Soline.

| Variable | Rôle |
|----------|------|
| `VOICE_AI_TOOL_SECRET` | Bearer token tools |

| Route | Rôle |
|-------|------|
| `POST /api/voice/artisan/create-quote-draft` | Brouillon devis depuis appel |
| `POST /api/voice/artisan/quota-status` | Quota vocal |
| `POST /api/voice/artisan/availability` | Créneaux dispos |
| `POST /api/voice/artisan/appointment-info` | Infos RDV |
| `POST /api/voice/artisan/schedule` | Désactivé |

Auth : `Authorization: Bearer ${VOICE_AI_TOOL_SECRET}` (`src/features/voice/lib/tool-auth.ts`).

### Pool numéros (Pro / Premium)

- Table `voice_number_pool` + RPC `claim_voice_number_from_pool` / `release_voice_number_from_pool` (migration `28_voice_number_pool.sql`).
- À l’abonnement **Pro** ou **Premium** (statut `active`, `trialing` ou `past_due`), un numéro disponible est attribué via `syncSubscriptionVoiceNumber` (webhook Stripe → `syncProfileFromStripeSubscription`).
- Passage **Base** ou résiliation : libération du mapping + retour du numéro au pool.
- Gestion ops : **`/admin/telecom/pool`** (ajout des numéros Twilio déjà branchés ElevenLabs).

---

## 8. IA & recherche

### Mistral

| Variable | Défaut |
|----------|--------|
| `MISTRAL_API_KEY` | requis |
| `MISTRAL_CHAT_MODEL` | `open-mistral-nemo` |

API : `https://api.mistral.ai/v1` — `/chat/completions`, `/embeddings` (`mistral-embed`).

Routes : `/api/ai/assistant`, `qualify-lead`, `generate-quote-from-chat`, `suggest-reply`, `suggest-quote-notes`, `summarize-quote`, `/api/estimation/chat`.

### Tavily (optionnel)

| Variable | Rôle |
|----------|------|
| `TAVILY_API_KEY` | `POST https://api.tavily.com/search` |

Sans clé : métré devis repose sur le LLM seul.

---

## 9. Autres services

| Service | Variables | Usage |
|---------|-----------|-------|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Auth, BDD, storage, webhooks (client admin) |
| **Web Push (PWA)** | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notifications smartphone |
| **Resend** | `RESEND_API_KEY`, `EMAIL_FROM` | E-mails transactionnels (relances, etc.) — sans clé : log console |
| **Cron Vercel** | `CRON_SECRET` | `/api/cron/e-reporting`, `/api/cron/invoice-reminders` |
| **App URLs** | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_MARKETING_URL`, `VERCEL_URL` | Liens absolus, callbacks |
| **API Adresse (BAN)** | — (public) | `api-adresse.data.gouv.fr` — géocodage (`src/lib/geo/ban.ts`) |

**Catalogues ouvrages** : tables internes Supabase (`work_library`, import CSV) — pas d'API externe catalogue métier.

---

## 10. Synthèse webhooks

| Route | Auth | Idempotence / robustesse |
|-------|------|--------------------------|
| `/api/webhooks/stripe` | Signature Stripe | Event ID upsert ; facture skip si paid |
| `/api/webhooks/facturation-electronique` | HMAC PA | Rejeu = MAJ statut ; journal audit |
| `/api/webhooks/mysendingbox` | Secret partagé | Statut monotonic ; unknown → 200 |
| `/api/webhooks/rubypayeur` | HMAC | unknown → 200 |
| `/api/webhooks/twilio/status` | Signature Twilio | Unique `twilio_call_sid` |

Utilitaires communs : `src/lib/recovery/webhook-security.ts` (`verifyHmacSignature`, `verifySharedSecret`, comparaison timing-safe).

---

## 11. Variables d'environnement — référence

### Présentes dans `.env.example`

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_MARKETING_URL
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
CRON_SECRET
PA_PROVIDER
PA_API_KEY
PA_API_URL
PA_WEBHOOK_SECRET
PA_RETRY_ATTEMPTS
E_REPORTING_PROVIDER
E_REPORTING_API_URL
E_REPORTING_API_KEY
FACTURX_SKIP_SCHEMATRON
FACTURX_SKIP_STACKFORGE
FACTURX_SKIP_STAFYNAKSA
MYSENDINGBOX_API_KEY
MYSENDINGBOX_WEBHOOK_SECRET
RUBYPAYEUR_API_URL
RUBYPAYEUR_API_KEY
RUBYPAYEUR_WEBHOOK_SECRET
RUBYPAYEUR_PARTNER_ID
RUBYPAYEUR_COMMISSION_RATE
MISTRAL_API_KEY
MISTRAL_CHAT_MODEL
TAVILY_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

### Utilisées dans le code, absentes de `.env.example`

```
TWILIO_AUTH_TOKEN
TWILIO_STATUS_CALLBACK_URL
VOICE_AI_TOOL_SECRET
RESEND_API_KEY
EMAIL_FROM
STRIPE_PAYMENT_LINK_BASE_MONTHLY
STRIPE_PAYMENT_LINK_BASE_ANNUAL
STRIPE_PAYMENT_LINK_PRO_MONTHLY
STRIPE_PAYMENT_LINK_PRO_ANNUAL
STRIPE_PAYMENT_LINK_PREMIUM_MONTHLY
STRIPE_PAYMENT_LINK_PREMIUM_ANNUAL
VERCEL_URL                    # injecté automatiquement sur Vercel
```

### Notes

- `FACTURX_SKIP_SCHEMATRON` : documenté mais **non lu** en runtime (validation prod = StackForge XSD uniquement).
- `docaposte` et `confactura` réutilisent l'adapter HTTP générique (`PA_API_URL` + `PA_API_KEY`).

---

## 12. Fichiers clés

| Intégration | Chemin |
|-------------|--------|
| Factur-X | `src/lib/billing/facturx/` |
| Finalisation + routage B2B/B2C | `src/lib/billing/invoicing/invoice-service.ts` |
| Webhook PA | `src/app/api/webhooks/facturation-electronique/route.ts` |
| E-reporting cron | `src/app/api/cron/e-reporting/route.ts` |
| MySendingBox | `src/lib/services/mysendingbox.ts`, `src/lib/recovery/process-mysendingbox-webhook.ts` |
| RubyPayeur | `src/lib/services/rubypayeur.ts`, `src/lib/recovery/process-rubypayeur-webhook.ts` |
| Stripe | `src/app/api/webhooks/stripe/route.ts`, `src/lib/stripe/server.ts` |
| Twilio | `src/app/api/webhooks/twilio/status/route.ts` |
| Voice tools | `src/features/voice/lib/tool-auth.ts` |
| Mistral | `src/lib/ai/mistral.ts` |
| Tavily | `src/lib/ai/web-search.ts` |
