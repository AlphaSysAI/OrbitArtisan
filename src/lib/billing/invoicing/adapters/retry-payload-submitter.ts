import type { IPayloadSubmitter, PaSubmissionPayload, PaSubmissionResult } from "../payload-submitter";

type RetryOptions = {
  maxAttempts?: number;
  delayMs?: number;
};

/**
 * Réessaie la soumission PA en cas d'erreur réseau ou HTTP 5xx.
 */
export class RetryPayloadSubmitter implements IPayloadSubmitter {
  constructor(
    private readonly inner: IPayloadSubmitter,
    private readonly options: RetryOptions = {},
  ) {}

  async submitEInvoice(payload: PaSubmissionPayload): Promise<PaSubmissionResult> {
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 3);
    const delayMs = this.options.delayMs ?? 800;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.inner.submitEInvoice(payload);
      } catch (error) {
        lastError = error;
        const retryable = isRetryablePaError(error);
        if (!retryable || attempt === maxAttempts) break;
        await sleep(delayMs * attempt);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

function isRetryablePaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (/PA HTTP 5\d\d|Pennylane PA 5\d\d|fetch failed|ECONNRESET|ETIMEDOUT/i.test(error.message)) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
