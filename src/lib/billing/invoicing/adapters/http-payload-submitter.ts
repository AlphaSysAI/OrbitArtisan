import type { IPayloadSubmitter, PaSubmissionPayload, PaSubmissionResult } from "../payload-submitter";

/**
 * Soumission générique vers une PA via HTTP (AFNOR XP Z12-013 / Iopole, SUPER PDP, etc.).
 * Configure PA_API_URL + PA_API_KEY dans l'environnement.
 */
export class HttpPayloadSubmitter implements IPayloadSubmitter {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  async submitEInvoice(payload: PaSubmissionPayload): Promise<PaSubmissionResult> {
    const formData = new FormData();
    const pdfBlob = new Blob([Buffer.from(payload.facturXPdf)], { type: "application/pdf" });
    const pdfName = `facture-${payload.invoiceNumber}.pdf`;

    // Champs compatibles AFNOR XP Z12-013 et adapters génériques.
    formData.append("file", pdfBlob, pdfName);
    formData.append("pdf", pdfBlob, pdfName);
    formData.append("xml", new Blob([payload.facturXXml], { type: "application/xml" }), "factur-x.xml");
    formData.append(
      "metadata",
      JSON.stringify({
        invoiceId: payload.invoiceId,
        invoiceNumber: payload.invoiceNumber,
        format: "factur-x",
        profile: "en16931",
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
