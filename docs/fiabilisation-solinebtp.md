# Fiabilisation SolineBTP — bilan de recette

Branche locale `codex/fiabilisation-solinebtp`, départ `b3367a2`. Les 21 constats de l’audit ont été repris sur la même révision. Les références F01–F21 renvoient au [rapport du 4 novembre 2026](audits/2026-11-04/RAPPORT.md), qui conserve les observations d’origine. Les scripts de caractérisation de cet audit décrivent le comportement avant correction. La recette actuelle utilise les tests de `src` et le scénario SQL dédié.

## Lot A — devis, facturation et règlements

- **F02 — envoi avant écriture des lignes.** `save_quote_document` et `send_quote_document` verrouillent le brouillon, valident la cohérence et rendent la transition atomique. La recette SQL teste création et envoi sous RLS, rejet d’une ligne invalide et restauration des lignes du brouillon. L’envoi de notification peut encore échouer après persistance, puis être repris par le renvoi explicite.
- **F01 — confusion HT/TTC.** `invoice-amounts.ts` mutualise le calcul pour le PDF, le CII et l’e-reporting. Encaissement, relances et export lisent la TVA des lignes. Le test fait concorder les consommateurs sur 1 000 € HT ventilés à 10 % et 20 %, soit 1 150 € TTC.
- **F03 — en-tête de solde divergent des lignes.** L’allocation répartit la retenue sur l’ensemble des postes et réconcilie les centimes. Le test reproduit l’exemple 950 € du rapport. La finalisation refuse une divergence historique. Le traitement de la retenue est conservé à la demande du responsable produit.
- **F04 — ventilation des acomptes et avoirs.** Le prorata par taux a été autorisé pour la recette. Le test couvre deux taux, un centime résiduel et un achat direct. L’avoir reprend les lignes source en base. La recette SQL couvre la conservation de la TVA et le refus d’un second avoir intégral. Validation comptable requise avant activation du prorata et pour le traitement des changements de régime, des situations et de la retenue.
- **F06 — avoir payable ou relancé.** Le filtre de créance est commun au paiement, aux relances et aux actions de recouvrement. Un avoir émis suspend les demandes automatiques sur sa source. Le test couvre les deux exclusions. L’interface métier ne modélise pas encore une compensation ou un remboursement.
- **F07 — paiement échoué sur facture en retard.** Une facture en retard reste payable. Le webhook compare le TTC, accepte la transition depuis `sent` et `overdue`, enregistre la date et ignore le rejeu. Le test couvre l’ancien montant HT, le paiement tardif et son rejeu. Les paiements reçus en présence d’un litige, après avoir ou à un montant historique différent restent à rapprocher manuellement. Aucun remboursement n’est déclenché.

## Lot B — transactions, preuves, sécurité et conservation

- **F05 — cumul et écritures partielles.** Les brouillons débiteurs réservent, les avoirs brouillons ne libèrent rien et une erreur de lecture stoppe l’opération. La migration 68 compare le cumul sous verrou et enregistre lignes et en-tête ensemble. Les tests couvrent l’erreur de lecture, le cumul périmé et le rollback. Les écritures historiques n’ont pas été réparées.
- **F08 — fausse transmission.** La simulation ne consomme plus la file. Le worker ne traite que les entrées qu’il a réclamées et distingue un résultat en file d’un résultat soumis. Le test vérifie qu’une configuration simulée n’accède pas à la file. Les entrées historiques et les envois externes ambigus nécessitent un rapprochement opérateur avant reprise.
- **F09 — qualification professionnelle incomplète.** La présence d’un SIREN ou SIRET déclenche le traitement professionnel même sans TVA. Le test couvre un SIREN seul. La saisie explicite du type et de l’identité légale d’un client sans compte reste à concevoir. Le gel B2B (absence de PA) reste actif, mais une période transitoire jusqu’au 31 août 2027 émet les factures professionnelles en PDF classique archivé, sans transmission ni e-reporting (migration 73) ; le gel se réactive automatiquement le 1er septembre 2027. Calendrier à confirmer par l’expert-comptable.
- **F10 — régénération depuis des profils modifiables.** Les nouvelles factures B2C téléchargent le PDF archivé. Le comptable reçoit le même document. La date d’émission et l’échéance sont établies avant rendu. La recette SQL vérifie l’écriture et l’immutabilité de l’archive. Les documents historiques dépourvus de PDF et la chaîne Factur-X B2B demandent une stratégie séparée.
- **F12 — relations inter-entreprises.** La migration 70 ajoute les clés de rattachement composées et rejette les nouvelles liaisons entre artisans. Un test SQL utilise deux artisans et tente une saisie de temps sur un chantier étranger. Les anciennes relations restent à contrôler avant validation des contraintes historiques.
- **F13 — conservation après clôture.** Le choix doit être validé avec le responsable juridique/comptable. Options soumises : suspendre la purge des comptes détenant des factures émises, préparer un export vérifiable, ou conserver provisoirement la règle actuelle. Aucun effacement ni changement de politique réalisé pendant cette recette.
- **F21 — reprise de la finalisation.** Le numéro réservé est réutilisé et les écritures B2C sont transactionnelles. Une tentative obsolète ne peut plus persister après perte de son verrou. Le test vérifie rejet et rejeu. Avant levée du gel B2B, il faut valider la clé d’idempotence, les accusés et la récupération du dépôt auprès de la PA réelle.

## Lot C — cohérence et IA

- **F11 — duplication partielle.** La duplication réutilise la transaction de devis et reprend les propriétés fournisseur et achat direct. La recette SQL vérifie la fidélité des lignes. Une duplication ne transporte ni signature ni statut.
- **F14 — historique ancien.** Les trois routes de rédaction choisissent les derniers messages puis les remettent dans l’ordre de lecture. Test avec correction d’une date dans les derniers messages.
- **F15 — conversion TTC contradictoire.** Les deux prompts partagent la même consigne. Le garde-fou détecte aussi les variantes ponctuées de TTC et renvoie la consigne à valider sans appel modèle. Test local sur le patch vocal et les deux textes. Un taux par ligne reste nécessaire pour proposer une conversion fiable.
- **F16 — compte rendu perdu et version trompeuse.** Un post-appel signé est enregistré avant traitement et réclamé avec verrou temporaire. Le cron des appels reprend un événement éligible et les relectures sont dédupliquées par conversation ou SID. Le contenu d’attente est retiré après traitement. La version console reste indiquée comme non vérifiée en l’absence d’override. La recette SQL teste prise, concurrence logique et reprise après bail expiré. La cadence du cron et les événements épuisant leurs tentatives nécessitent un suivi opérateur.

## Lot D — coûts et parcours

- **F17 — cascade IA non bornée.** Assistant et génération depuis le chat disposent d’un budget de temps et d’appels partagé. L’assistant borne le contexte transmis et limite les appels par artisan. Le test vérifie l’isolation des budgets entre requêtes. Coût et qualité restent à mesurer sur un corpus d’artisans.
- **F18 — compteur non atomique.** Une transaction sérialise les admissions par clé. Les routes publiques IA concernées refusent un nouvel appel IA si le compteur est indisponible. La recette SQL vérifie seuil et rôle d’accès. Les parcours dont la règle privilégie la disponibilité restent permissifs.
- **F19 — marge fictive.** Les vues cessent d’afficher une marge sur des coûts inconnus. Le chantier reprend la ventilation du devis et distingue un coût horaire renseigné du taux vendu. Il reste à recueillir les coûts réels pour afficher une rentabilité.
- **F20 — documentation et initialisation.** Le contrat métier, le schéma et les intégrations ont été actualisés. Le SQL d’initialisation contenait des séparateurs non commentés qui bloquaient une base neuve. Ils ont été corrigés avant la recette de la chaîne de migrations.

## Vérifications et conditions de recette

```sh
npm test
node_modules/.bin/tsc --noEmit --incremental false
npm run lint
SOLINE_PGLITE_DIST=/chemin/vers/pglite/dist node supabase/tests/financial-transactions.mjs
```

Le scénario PostgreSQL embarqué recrée en mémoire le schéma et les migrations. Il utilise des tables Auth/Storage fictives et neutralise l’index vectoriel hors périmètre. Il ne remplace pas une recette PostgREST et fournisseurs sur un projet Supabase isolé. Les migrations 67 à 72 sont à appliquer dans l’ordre sur la future base de recette, avant l’exécution de l’application correspondante. Aucun déploiement, opération distante ni effet réel de paiement ou communication n’a été exécuté.
