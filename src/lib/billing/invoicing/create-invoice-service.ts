import type { SupabaseClient } from "@supabase/supabase-js";

import { HttpPayloadSubmitter } from "./adapters/http-payload-submitter";
import { NoopPayloadSubmitter } from "./adapters/noop-payload-submitter";
import { InvoiceService } from "./invoice-service";
import type { IPayloadSubmitter, PayloadSubmitterProvider } from "./payload-submitter";

export function resolvePayloadSubmitterProvider(): PayloadSubmitterProvider {
  const raw = (process.env.PA_PROVIDER ?? "noop").trim().toLowerCase();
  if (raw === "pennylane" || raw === "docaposte" || raw === "confactura" || raw === "http" || raw === "noop") {
    return raw;
  }
  return "noop";
}

/** Fabrique l'adapter PA configuré via PA_PROVIDER (défaut: noop). */
export function createPayloadSubmitter(provider = resolvePayloadSubmitterProvider()): IPayloadSubmitter {
  const apiUrl = process.env.PA_API_URL?.trim();
  const apiKey = process.env.PA_API_KEY?.trim();

  switch (provider) {
    case "pennylane":
    case "docaposte":
    case "confactura":
    case "http":
      if (apiUrl && apiKey) {
        return new HttpPayloadSubmitter(apiUrl, apiKey);
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
