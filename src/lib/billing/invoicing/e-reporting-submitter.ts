import type { EReportingBatchPayload } from "./e-reporting";

export type EReportingSubmissionResult = {
  submissionId: string;
  status: "submitted" | "queued";
  rawResponse?: unknown;
};

/** Soumission des lots e-reporting vers la PA ou l'administration. */
export interface IEReportingSubmitter {
  submitBatch(payload: EReportingBatchPayload): Promise<EReportingSubmissionResult>;
}

/**
 * Soumission HTTP générique (endpoint PA e-reporting / concentrateur).
 * Body JSON : lot groupé par artisan et période.
 */
export class HttpEReportingSubmitter implements IEReportingSubmitter {
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

    const parsed = rawResponse as { submissionId?: string; id?: string; status?: string };
    const submissionId = String(parsed.submissionId ?? parsed.id ?? `ereporting-${payload.artisanId}-${payload.reportingPeriod}`);
    const statusRaw = (parsed.status ?? "submitted").toLowerCase();
    const status = statusRaw === "queued" ? ("queued" as const) : ("submitted" as const);

    return { submissionId, status, rawResponse };
  }
}

/** No-op pour dev / tests — marque le lot comme soumis sans appel externe. */
export class NoopEReportingSubmitter implements IEReportingSubmitter {
  async submitBatch(payload: EReportingBatchPayload): Promise<EReportingSubmissionResult> {
    return {
      submissionId: `noop-ereporting-${payload.artisanId}-${Date.now()}`,
      status: "submitted",
    };
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
