import type { IPayloadSubmitter, PaSubmissionPayload, PaSubmissionResult } from "../payload-submitter";

/**
 * Soumission vers une Plateforme Agréée via HTTP (Iopole, Pennylane API, etc.).
 * Configure PA_API_URL + PA_API_KEY dans l'environnement.
 */
export class HttpPayloadSubmitter implements IPayloadSubmitter {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  async submitEInvoice(payload: PaSubmissionPayload): Promise<PaSubmissionResult> {
    const formData = new FormData();
    formData.append(
      "pdf",
      new Blob([Buffer.from(payload.facturXPdf)], { type: "application/pdf" }),
      `facture-${payload.invoiceNumber}.pdf`,
    );
    formData.append("xml", new Blob([payload.facturXXml], { type: "application/xml" }), "factur-x.xml");
    formData.append(
      "metadata",
      JSON.stringify({
        invoiceId: payload.invoiceId,
        invoiceNumber: payload.invoiceNumber,
        seller: payload.seller,
        buyer: payload.buyer,
      }),
    );

    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
      body: formData,
    });

    const rawText = await res.text();
    let rawResponse: unknown = rawText;
    try {
      rawResponse = JSON.parse(rawText);
    } catch {
      /* texte brut */
    }

    if (!res.ok) {
      throw new Error(`PA HTTP ${res.status}: ${rawText.slice(0, 300)}`);
    }

    const parsed = rawResponse as { submissionId?: string; id?: string; status?: string };
    const submissionId = parsed.submissionId ?? parsed.id ?? `http-${payload.invoiceId}`;
    const statusRaw = (parsed.status ?? "queued").toLowerCase();
    const status =
      statusRaw === "accepted" || statusRaw === "rejected" ? statusRaw : ("queued" as const);

    return {
      submissionId,
      status,
      rawResponse,
    };
  }
}
