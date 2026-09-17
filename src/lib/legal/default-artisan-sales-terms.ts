/** Modèle indicatif de CGV BTP — l'artisan doit l'adapter à son activité. */

export const ARTISAN_SALES_TERMS_PLACEHOLDER =
  "Décrivez ici vos conditions générales de vente (délais, paiement, garanties, réclamations…). Ce texte apparaîtra en annexe de vos devis PDF et sur votre vitrine.";

export const DEFAULT_ARTISAN_SALES_TERMS_TEMPLATE = `1. Objet
Les présentes conditions générales de vente (CGV) s'appliquent à toutes les prestations de travaux et fournitures proposées par l'entreprise, sous réserve de conditions particulières acceptées par écrit.

2. Devis et commande
Tout devis est valable 3 mois à compter de sa date d'émission, sauf mention contraire. La commande devient ferme après signature du devis par le client (bon pour accord).

3. Prix
Les prix sont indiqués en euros, hors taxes ou toutes taxes comprises selon le document. Ils comprennent la main-d'œuvre, les fournitures décrites et les frais de déplacement le cas échéant.

4. Acompte et paiement
Un acompte peut être demandé à la commande. Le solde est exigible à la fin des travaux ou selon l'échéancier convenu. Tout retard de paiement peut entraîner des pénalités et une indemnité forfaitaire de recouvrement conformément à la réglementation en vigueur.

5. Délais d'exécution
Les délais sont indicatifs et courent à compter de la réception de l'acompte et de la disponibilité des accès au chantier. Un retard indépendant de notre volonté ne peut donner lieu à indemnisation.

6. Garanties
Les travaux sont réalisés conformément aux règles de l'art et aux normes applicables. Les garanties légales (notamment décennale et biennale le cas échéant) s'appliquent selon la nature des ouvrages.

7. Réclamations
Toute réserve doit être formulée par écrit dans un délai de 8 jours suivant la réception des travaux.

8. Médiation
En cas de litige, le client consommateur peut recourir gratuitement au médiateur de la consommation dont les coordonnées figurent sur le devis ou la facture.

9. Droit applicable
Les présentes CGV sont soumises au droit français.`;

export function splitSalesTermsLines(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
