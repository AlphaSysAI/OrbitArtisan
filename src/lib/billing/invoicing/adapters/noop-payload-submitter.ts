import { randomUUID } from "node:crypto";

import type { IPayloadSubmitter, PaSubmissionPayload, PaSubmissionResult } from "../payload-submitter";

/**
 * Implémentation par défaut : enregistre la soumission sans appeler d'API externe.
 * Utile en dev et tant qu'aucun partenaire PA n'est configuré.
 */
export class NoopPayloadSubmitter implements IPayloadSubmitter {
  async submitEInvoice(payload: PaSubmissionPayload): Promise<PaSubmissionResult> {
    return {
      submissionId: `noop-${payload.invoiceId}-${randomUUID().slice(0, 8)}`,
      status: "queued",
      rawResponse: { provider: "noop", queuedAt: new Date().toISOString() },
    };
  }
}
