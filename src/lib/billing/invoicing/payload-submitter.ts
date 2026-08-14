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

export type PayloadSubmitterProvider = "noop" | "pennylane" | "docaposte" | "confactura";
