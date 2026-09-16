# Règles métier — Devis, facturation et calculs

Document de contexte factuel, dérivé du code (`src/lib/billing/`, `src/app/app/quotes/`, `src/app/app/invoices/`, `supabase/`).  
**Convention** : tous les montants métier sont stockés en **centimes** (entiers).

---

## 1. Devis — calcul du total

### Base du total (`quotes.grand_total`)

Le total devis est **HT, sans TVA** :

```
materials_total = Σ (quantity × unit_price)   // matériaux avec exclude_from_invoice = false
labor_total     = round(labor_rate_per_hour × labor_duration_minutes / 60)
grand_total     = labor_total + materials_total
```

**Ordre des opérations** (serveur `quotes/actions.ts`, miroir UI `quote-form.tsx`) :

1. Durée MO = somme des durées des prestations sélectionnées, avec override optionnel `labor_duration_minutes`.
2. MO arrondie à l’entier le plus proche (`Math.round`).
3. Matériaux : produit entier par ligne (`line_total = quantity × unit_price`), pas d’arrondi intermédiaire.
4. Total = somme MO + matériaux facturables.

### Ce qui n’entre pas dans `grand_total`

| Élément | Comportement |
|---------|--------------|
| **Prestations (`quote_services`)** | Durées et `unit_price` stockés ; sert au calcul de la durée MO, **pas** au total. |
| **Matériaux achat direct** (`exclude_from_invoice = true`) | Affichés « hors facture », exclus de `materials_total`. |
| **TVA** | Absente du total devis. Taux par matériau (`vat_rate` : 5,5 / 10 / 20 %) et taux réduit devis (`reduced_vat_rate`) servent à l’attestation et au catalogue, pas au calcul du total. |
| **Remise commerciale** | **Non implémentée** (aucune logique discount dans le code billing). |

### Conversion saisie

EUR → centimes : `Math.round(valeur × 100)`.

### Marge (preview UI uniquement)

Estimation indicative (`quote-margin.ts`) : coût matériaux et MO à **65 %** du montant facturé, marge = `grand_total − coûts`.

---

## 2. Factures — calcul et TVA

### Montants en base (`invoices.grand_total`)

En-tête facture = montant **HT** facturé (centimes). La TVA est calculée **à partir des lignes**, pas stockée séparément en en-tête.

### TVA — ordre et arrondi

| Règle | Détail |
|-------|--------|
| **Taux par ligne** | Défaut : **20 %**, catégorie `S` (`DEFAULT_INVOICE_LINE_VAT`). |
| **Calcul** | `taxCents = round(line_total × vat_rate / 100)` **par ligne**. |
| **Agrégation** | Somme des TVA par ligne → total TVA ; TTC = HT lignes + TVA (`build-cii-invoice.ts`, `render-invoice-pdf.ts`). |
| **Arrondi global TTC** | **Aucun** — pas de réconciliation finale pour aligner Σ lignes et en-tête. |

### Propagation TVA devis → facture

À la création de facture depuis un devis accepté, **toutes les lignes** reçoivent 20 % / catégorie `S`.  
Les champs devis `reduced_vat_rate`, `quote_materials.vat_rate` et l’attestation TVA réduite **ne sont pas repris** sur les lignes facture (`invoices/actions.ts`).

L’attestation Cerfa (`render-vat-attestation-pdf.ts`) affiche le montant devis en **HT** (`grand_total / 100`).

### Décalage HT / TTC (documents vs paiement)

| Contexte | Nature du montant |
|----------|-------------------|
| Devis UI | HT (« Total facturé ») |
| PDF devis | Libellé **« Total TTC »** alors que le montant est HT |
| PDF / Factur-X facture | HT + TVA par ligne → TTC |
| Paiement Stripe client | `unit_amount = invoice.grand_total` (= **HT** en base) |

---

## 3. Acomptes, situations et solde restant dû

### Reste à facturer

```
alreadyInvoiced = Σ invoices.grand_total   // liées au devis, hors invoice_type = 'credit_note'
remaining       = max(0, quote.grand_total − alreadyInvoiced)
```

Fichiers : `create-btp-invoice.ts` (`sumInvoicedOnQuote`), `invoice-types.ts` (`computeRemainingBillableCents`).

### Formules acompte et situation

```
acompte(p %)     = round(quote.grand_total × p / 100)        // p clampé 0–100
situation(p cum) = max(0, round(quote.grand_total × p / 100) − alreadyInvoiced)
acompte plafonné = min(montant acompte, remaining)
```

Contrôle à la création : `amountCents > remaining` → erreur `exceeds_remaining`.

### Types de facture BTP (`invoice_type`)

| Type | Rôle | Contenu typique |
|------|------|-----------------|
| `deposit` | Acompte | 1 ligne, montant = % du devis |
| `progress` | Situation | 1 ligne, delta du % cumulé déjà facturé |
| `standard` | Première facture « complète » | Lignes détaillées proratisées sur le reste |
| `final` | Solde (ou libération retenue) | Idem ou montant retenue |
| `credit_note` | Avoir | Montant = facture source ; **exclu** du `alreadyInvoiced` |

Acomptes/situations : `labor_total = 0`, `materials_total = 0`, `grand_total = amountCents` (`createTypedInvoiceFromQuote`).

### Facture standard / solde depuis devis accepté

(`createInvoiceFromQuote` dans `invoices/actions.ts`)

1. `remaining` = reste à facturer.
2. Type : `standard` si première facture, sinon `final`.
3. Prorata en-tête :  
   `laborShare = round(quote.labor_total × remaining / quote.grand_total)`  
   `materialsShare = remaining − laborShare`
4. **Retenue de garantie** (profil `default_retention_rate`, défaut **5 %**, plage 0–10 %) :  
   appliquée si type `final` **ou** si des factures existent déjà sur le devis.  
   `retention_amount = round(remaining × rate / 100)`  
   `billableRemaining = remaining − retention_amount`  
   Montant retenu **hors** `grand_total` facturé ; libération via facture `final` dédiée (`releaseRetention` dans `btp-actions.ts`).
5. Lignes : MO + prestations + matériaux, chacune proratisée :  
   `scaled = round(line_total_devis × billableRemaining / quote.grand_total)`  
   Prix unitaire matériau : `round(scaled / quantity)`.

**Prorata** = répartition proportionnelle du solde entre postes, **pas** de remise commerciale.

### Avoirs

Montant = `grand_total` de la facture source. Statut source requis : `sent`, `paid` ou `overdue`.  
Les avoirs **ne diminuent pas** `alreadyInvoiced` → le reste à facturer peut rester surévalué après avoir.

---

## 4. Cycle de vie — Devis

### Statuts (`quote_status`)

| Statut | Signification |
|--------|---------------|
| `draft` | Brouillon |
| `sent` | Envoyé au client |
| `accepted` | Signé par le client |
| `rejected` | Refusé |

### Transitions implémentées

```
création → draft          (défaut)
création → sent           (save_mode = send, ou conversation + client lié)
sent → accepted           (RPC client_accept_quote — client propriétaire, depuis sent uniquement)
sent → rejected           (RPC client_reject_quote)
```

**Non implémenté** : passage draft → sent après création, édition d’un devis existant, retour accepted → sent.  
La facturation exige `status = accepted`.

Duplication (`duplicateQuote`) : copie en nouveau `draft`.

---

## 5. Cycle de vie — Facture

### Statut métier app (`invoices.status`)

| Statut | Signification |
|--------|---------------|
| `draft` | Brouillon, modifiable |
| `sent` | Finalisée / émise |
| `paid` | Payée |
| `overdue` | Échéance dépassée, impayée |

Contrainte SQL : `draft | sent | paid | overdue` (migration `06_retake_gaps.sql`).  
Label UI `cancelled` présent dans `status-labels.ts` mais **absent** de la contrainte DB.

### Transitions

```
draft → sent     (finalisation InvoiceService — status draft, finalized_at null)
sent  → paid     (webhook Stripe montant exact, ou webhook PA PAYMENT_RECEIVED)
sent  → overdue  (cron relances : due_date < aujourd’hui, invoice-reminders.ts)
sent/overdue → paid | draft | sent | overdue   (mise à jour manuelle artisan)
```

Finalisation : génère PDF ; B2B → Factur-X + soumission PA ; B2C → PDF + file e-reporting.

### Statuts parallèles (distincts du statut app)

| Flux | Statuts |
|------|---------|
| **E-facturation** (`e_invoicing_status`) | `DRAFT` → `DEPOSITED` → `RECEIVED_BY_PLATFORM` → `TRANSMITTED` → `APPROVED` / `REJECTED` / `PAID` |
| **Recouvrement** (`recovery_status`) | `none` → `formal_notice_sent` → `submitted_to_collection` → `in_progress` → `collected` / `failed` |

---

## 6. Cas limites identifiés dans le code

| Cas | Impact |
|-----|--------|
| **Prestations en lignes facture** | Lignes `quote_services` proratisées alors que leurs montants **ne sont pas** dans `quote.grand_total` → risque que Σ lignes HT > `billableRemaining`. |
| **Retenue + laborShare élevé** | Si `materialsShare` passe sous 0, il est forcé à 0 mais `labor_total` en-tête peut rester > `grand_total`. |
| **Matériaux `exclude_from_invoice`** | Filtrés à la création devis ; **pas** filtrés à la requête matériaux lors de la facturation détaillée. |
| **Avoirs et solde** | Avoirs exclus du cumul facturé → reste à facturer non réduit après avoir. |
| **TVA réduite devis** | Attestation PDF possible ; factures émises toujours à 20 % par défaut. |
| **PDF devis « Total TTC »** | Libellé incorrect pour un montant HT. |
| **Paiement Stripe** | Montant HT facturé, sans ajout TVA côté checkout. |
| **Arrondis prorata** | Arrondi par ligne ; écarts possibles entre Σ lignes et en-tête. |
| **Multi-factures / devis** | Plusieurs factures par devis autorisées (index unicité supprimé, migration 05) ; contrôle applicatif uniquement. |
| **Remises** | Absentes — aucun mécanisme de remise ligne ou globale. |

---

## 7. Fichiers de référence

| Domaine | Fichier |
|---------|---------|
| Calcul devis (serveur) | `src/app/app/quotes/actions.ts` |
| Formules acompte / situation | `src/lib/billing/invoice-types.ts` |
| Création factures typées | `src/lib/billing/create-btp-invoice.ts` |
| Facture depuis devis + retenue | `src/app/app/invoices/actions.ts` |
| Avoir + libération retenue | `src/app/app/invoices/btp-actions.ts` |
| TVA Factur-X | `src/lib/billing/facturx/build-cii-invoice.ts` |
| Finalisation | `src/lib/billing/invoicing/invoice-service.ts` |
| Relances / overdue | `src/lib/billing/invoice-reminders.ts` |
| Acceptation devis (RPC) | `supabase/init.sql` (`client_accept_quote`, `client_reject_quote`) |
| Schéma BTP | `supabase/migration/05_btp_invoicing.sql`, `06_retake_gaps.sql` |
| Tests formules BTP | `src/lib/billing/btp-billing.test.ts` |
