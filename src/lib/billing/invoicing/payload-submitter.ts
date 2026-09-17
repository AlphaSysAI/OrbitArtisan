/** Données transmises à la Plateforme Agréée (PA) pour une facture B2B. */
export type PaSubmissionPayload = {
  invoiceId: string;
  invoiceNumber: string;
  facturXPdf: Uint8Array;
  facturXXml: string;
  seller: {
    name: string;
    siren: string | null;
    siret: string | null;
    vatNumber: string | null;
  };
  buyer: {
    name: string;
    siren: string | null;
    siret: string | null;
    vatNumber: string | null;
  };
};

export type PaSubmissionStatus = "queued" | "accepted" | "rejected";

export type PaSubmissionResult = {
  submissionId: string;
  status: PaSubmissionStatus;
  rawResponse?: unknown;
};

/**
 * Adapter interchangeable pour l'envoi vers une Plateforme Agréée (Pennylane, Docaposte, …).
 */
export interface IPayloadSubmitter {
  submitEInvoice(payload: PaSubmissionPayload): Promise<PaSubmissionResult>;
}

/**
 * `docaposte`, `confactura` et `superpdp` ne sont pas des SDK dédiés : ce sont des alias de
 * l'adapter HTTP générique (`HttpPayloadSubmitter`), qui n'existent que pour que les logs et la
 * config (`PA_PROVIDER`) restent lisibles selon le vrai fournisseur branché derrière `PA_API_URL`.
 * Voir `integrations.md` §2 (choix Vague 6) pour la comparaison de coût qui a mené à recommander
 * Super PDP comme candidat le moins cher pour un éditeur SaaS multi-artisans.
 */
export type PayloadSubmitterProvider =
  | "noop"
  | "http"
  | "pennylane"
  | "docaposte"
  | "confactura"
  | "superpdp";
