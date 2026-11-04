import type { IPayloadSubmitter, PaSubmissionResult } from "../payload-submitter";

/** Un environnement sans PA ne produit aucun accusé de transmission. */
export class NoopPayloadSubmitter implements IPayloadSubmitter {
  async submitEInvoice(): Promise<PaSubmissionResult> {
    throw new Error("pa_not_configured");
  }
}
