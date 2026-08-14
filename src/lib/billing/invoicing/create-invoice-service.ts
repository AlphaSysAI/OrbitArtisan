import type { SupabaseClient } from "@supabase/supabase-js";

import { NoopPayloadSubmitter } from "./adapters/noop-payload-submitter";
import { InvoiceService } from "./invoice-service";
import type { IPayloadSubmitter, PayloadSubmitterProvider } from "./payload-submitter";

export function resolvePayloadSubmitterProvider(): PayloadSubmitterProvider {
  const raw = (process.env.PA_PROVIDER ?? "noop").trim().toLowerCase();
  if (raw === "pennylane" || raw === "docaposte" || raw === "confactura" || raw === "noop") {
    return raw;
  }
  return "noop";
}

/** Fabrique l'adapter PA configuré via PA_PROVIDER (défaut: noop). */
export function createPayloadSubmitter(provider = resolvePayloadSubmitterProvider()): IPayloadSubmitter {
  switch (provider) {
    case "pennylane":
    case "docaposte":
    case "confactura":
      console.warn(`[PA] Provider "${provider}" non implémenté — fallback noop.`);
      return new NoopPayloadSubmitter();
    case "noop":
    default:
      return new NoopPayloadSubmitter();
  }
}

export function createInvoiceService(supabase: SupabaseClient): InvoiceService {
  return new InvoiceService(supabase, createPayloadSubmitter());
}
