import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyCustomer, type CustomerClassification } from "./classify-customer";

/**
 * Classifie B2B/B2C un client à partir de son `customer_user_id`, en
 * rechargeant ses identifiants légaux (`siren`/`siret`/`vat_number`) depuis
 * `customer_profiles`.
 *
 * Même logique que `loadFacturXDocumentFromDb` (`src/lib/billing/facturx/load-from-db.ts`),
 * dupliquée volontairement ici pour rester appelable dès la création du
 * brouillon — avant qu'un document Factur-X existe — sans faire dépendre
 * `invoicing-freeze` du module `facturx`.
 *
 * Sans `customer_user_id` (client non lié à un compte) ou sans profil
 * trouvé : classé B2C par défaut, comme le fait déjà `classifyCustomer` pour
 * un client sans SIREN/TVA renseignés — c'est le comportement déjà en
 * production au moment de la finalisation (`InvoiceService.finalize`), on ne
 * fait ici que l'appeler plus tôt, à la création du brouillon.
 */
export async function resolveCustomerClassification(
  supabase: SupabaseClient,
  customerUserId: string | null | undefined,
): Promise<CustomerClassification> {
  if (!customerUserId) return "b2c";

  const { data } = await supabase
    .from("customer_profiles")
    .select("siren, siret, vat_number")
    .eq("user_id", customerUserId)
    .maybeSingle();

  return classifyCustomer({
    siren: data?.siren ?? null,
    siret: data?.siret ?? null,
    vatNumber: data?.vat_number ?? null,
  });
}
