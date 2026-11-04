import type { EReportingBatchPayload } from "./e-reporting";

type EReportingSubmissionResult = {
  submissionId: string;
  status: "submitted" | "queued";
  rawResponse?: unknown;
};

/** Soumission des lots e-reporting vers la PA ou l'administration. */
interface IEReportingSubmitter {
  submitBatch(payload: EReportingBatchPayload): Promise<EReportingSubmissionResult>;
}

/**
 * Soumission HTTP générique (endpoint PA e-reporting / concentrateur).
 * Body JSON : lot groupé par artisan et période.
 */
class HttpEReportingSubmitter implements IEReportingSubmitter {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  async submitBatch(payload: EReportingBatchPayload): Promise<EReportingSubmissionResult> {
    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });

    const rawText = await res.text();
    let rawResponse: unknown = rawText;
    try {
      rawResponse = JSON.parse(rawText);
    } catch {
      /* texte brut */
    }

    if (!res.ok) {
      throw new Error(`E-reporting HTTP ${res.status}: ${rawText.slice(0, 400)}`);
    }

    const parsed = rawResponse && typeof rawResponse === "object"
      ? rawResponse as { submissionId?: unknown; id?: unknown; status?: unknown } : {};
    const id = parsed.submissionId ?? parsed.id;
    const status = typeof parsed.status === "string" ? parsed.status.toLowerCase() : null;
    if (typeof id !== "string" || !id.trim() || (status !== "queued" && status !== "submitted")) {
      throw new Error("e_reporting_unrecognized_ack");
    }
    return { submissionId: id.trim(), status, rawResponse };
  }
}

class NoopEReportingSubmitter implements IEReportingSubmitter {
  async submitBatch(): Promise<EReportingSubmissionResult> {
    throw new Error("e_reporting_not_configured");
  }
}

export function createEReportingSubmitter(): IEReportingSubmitter {
  const provider = (process.env.E_REPORTING_PROVIDER ?? process.env.PA_PROVIDER ?? "noop").trim().toLowerCase();
  const apiUrl = process.env.E_REPORTING_API_URL?.trim();
  const apiKey = process.env.E_REPORTING_API_KEY?.trim() ?? process.env.PA_API_KEY?.trim();

  if (provider !== "noop" && apiUrl && apiKey) {
    return new HttpEReportingSubmitter(apiUrl, apiKey);
  }

  if (provider !== "noop") {
    console.warn("[e-reporting] Provider configuré sans E_REPORTING_API_URL/API_KEY — mode noop.");
  }

  return new NoopEReportingSubmitter();
}
