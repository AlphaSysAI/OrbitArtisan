import type { IPayloadSubmitter, PaSubmissionPayload, PaSubmissionResult } from "../payload-submitter";

const DEFAULT_PENNYLANE_URL =
  "https://app.pennylane.com/api/external/v2/customer_invoices/e_invoices/imports";

/**
 * Soumission Factur-X vers Pennylane (PA) — API Entreprise V2.
 * @see https://pennylane.readme.io/reference/createcustomerinvoiceeinvoiceimport
 */
export class PennylanePayloadSubmitter implements IPayloadSubmitter {
  constructor(
    private readonly apiKey: string,
    private readonly apiUrl = DEFAULT_PENNYLANE_URL,
  ) {}

  async submitEInvoice(payload: PaSubmissionPayload): Promise<PaSubmissionResult> {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([Buffer.from(payload.facturXPdf)], { type: "application/pdf" }),
      `facture-${payload.invoiceNumber}.pdf`,
    );

    if (payload.buyer.siren || payload.buyer.siret) {
      formData.append(
        "invoice_options",
        JSON.stringify({
          external_reference: payload.invoiceId,
          invoice_number: payload.invoiceNumber,
        }),
      );
    }

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
      throw new Error(`Pennylane PA ${res.status}: ${rawText.slice(0, 400)}`);
    }

    const parsed = rawResponse as {
      id?: string | number;
      import_id?: string | number;
      submission_id?: string;
      status?: string;
    };

    const submissionId = String(
      parsed.id ?? parsed.import_id ?? parsed.submission_id ?? `pennylane-${payload.invoiceId}`,
    );

    const statusRaw = (parsed.status ?? "accepted").toLowerCase();
    const status =
      statusRaw === "rejected" || statusRaw === "error" ? ("rejected" as const) : ("accepted" as const);

    return { submissionId, status, rawResponse };
  }
}
