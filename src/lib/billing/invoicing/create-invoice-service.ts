import type { SupabaseClient } from "@supabase/supabase-js";

import { HttpPayloadSubmitter } from "./adapters/http-payload-submitter";
import { NoopPayloadSubmitter } from "./adapters/noop-payload-submitter";
import { PennylanePayloadSubmitter } from "./adapters/pennylane-payload-submitter";
import { RetryPayloadSubmitter } from "./adapters/retry-payload-submitter";
import { InvoiceService } from "./invoice-service";
import type { IPayloadSubmitter, PayloadSubmitterProvider } from "./payload-submitter";

export function resolvePayloadSubmitterProvider(): PayloadSubmitterProvider {
  const raw = (process.env.PA_PROVIDER ?? "noop").trim().toLowerCase();
  if (raw === "pennylane" || raw === "docaposte" || raw === "confactura" || raw === "http" || raw === "noop") {
    return raw;
  }
  return "noop";
}

function wrapWithRetry(submitter: IPayloadSubmitter): IPayloadSubmitter {
  const maxAttempts = Number(process.env.PA_RETRY_ATTEMPTS ?? "3");
  if (!Number.isFinite(maxAttempts) || maxAttempts <= 1) return submitter;
  return new RetryPayloadSubmitter(submitter, { maxAttempts });
}

/** Fabrique l'adapter PA configuré via PA_PROVIDER (défaut: noop). */
export function createPayloadSubmitter(provider = resolvePayloadSubmitterProvider()): IPayloadSubmitter {
  const apiUrl = process.env.PA_API_URL?.trim();
  const apiKey = process.env.PA_API_KEY?.trim();

  switch (provider) {
    case "pennylane":
      if (apiKey) {
        return wrapWithRetry(new PennylanePayloadSubmitter(apiKey, apiUrl));
      }
      console.warn("[PA] Provider pennylane sans PA_API_KEY — fallback noop.");
      return new NoopPayloadSubmitter();

    case "docaposte":
    case "confactura":
    case "http":
      if (apiUrl && apiKey) {
        return wrapWithRetry(new HttpPayloadSubmitter(apiUrl, apiKey));
      }
      console.warn(`[PA] Provider "${provider}" sans PA_API_URL/PA_API_KEY — fallback noop.`);
      return new NoopPayloadSubmitter();

    case "noop":
    default:
      return new NoopPayloadSubmitter();
  }
}

export function createInvoiceService(supabase: SupabaseClient): InvoiceService {
  return new InvoiceService(supabase, createPayloadSubmitter());
}
