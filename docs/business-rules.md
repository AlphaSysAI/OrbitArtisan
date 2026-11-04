# Contrat métier — devis, factures et règlements

Ce document décrit le comportement de la branche de fiabilisation. Les hypothèses fiscales de recette sont identifiées dans [le bilan de recette](fiabilisation-solinebtp.md).

## Devis

Les montants sont exprimés en centimes. Le total HT associe la main-d’œuvre au taux horaire et les fournitures facturées. Les achats directs apparaissent comme tels et sont exclus du montant dû. Les quantités de fournitures acceptent deux décimales. La TVA est ventilée pour le document client.

Un devis peut être enregistré et modifié en brouillon, envoyé, accepté ou refusé. La migration 67 enregistre l’en-tête et les lignes avant la transition « envoyé », dans une seule transaction. L’envoi d’un brouillon existant vérifie sa révision et la cohérence de son total. Les notifications sont déclenchées après la persistance du document et restent des opérations distinctes. Le code permet le renvoi d’un document déjà envoyé.

La duplication conserve les propriétés économiques des lignes, dont l’exclusion des achats directs. Le nouveau document est un brouillon et porte sa propre acceptation. Un avenant signé reste un parcours à spécifier.

## Factures

Les brouillons proviennent d’un devis accepté. Une facture débitrice brouillon réserve du HT sur le devis. Un avoir libère du HT uniquement après émission. L’en-tête et les lignes sont créés dans la même transaction, sous verrou du devis. Une divergence HT bloque l’émission.

Pour la recette, les acomptes et situations sont ventilés au prorata du HT par taux. Le solde est réparti entre les lignes en affectant les centimes résiduels aux plus grands restes. Le mode actuel de retenue est conservé. La libération est rattachée à la facture source et ne marque la retenue libérée qu’après émission B2C. L’avoir intégral reprend les lignes fiscales de la facture source. Un changement de régime qui altérerait ces lignes bloque l’avoir et demande une revue.

La finalisation B2C réserve un numéro réutilisable et fixe la date et l’échéance avant de produire le PDF. La facture émise, le PDF archivé et la ligne d’e-reporting sont persistés ensemble. Pour une facture historique sans archive, le téléchargement reste régénéré. Le parcours B2B reste gelé. Un SIREN ou SIRET identifié est un indice professionnel même sans TVA. Un client sans identité légale saisie ne peut pas être classé de manière certaine.

## Encaissement et relance

Le TTC est la somme des lignes HT et de la TVA arrondie par ligne, selon la règle existante. PDF, CII, e-reporting, checkout, webhook, relances et CSV reprennent ce calcul. Les données incompatibles avec le total enregistré sont écartées de l’encaissement automatique. Une facture échue peut être payée. Le webhook fait une transition conditionnelle et renseigne la date d’encaissement.

Un avoir ne peut pas être payé ni relancé. Un avoir émis suspend le recouvrement automatique de la facture source. La compensation, les paiements partiels, les remboursements et le rapprochement des paiements historiques restent à définir. Une relance n’écrase plus le statut d’une facture payée et une relance manuelle ne transforme pas une facture non échue en impayé.

Un export CSV sans lignes disponibles laisse le TTC vide. Les pièces et PDF archivés sont prioritaires dans l’envoi comptable. Aucun de ces mécanismes ne constitue une validation fiscale ou réglementaire.
