import { redirect } from "next/navigation";

import { splitPersonName } from "@/lib/contacts/display-name";
import { ContactSettingsForm } from "@/components/settings/contact-settings-form";
import { SupabaseMissing } from "@/components/supabase-missing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { updateCustomerSettings } from "./actions";

export default async function ClientSettingsPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SupabaseMissing title="Réglages indisponibles" />;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/compte/reglages");

  const { data: cp } = await supabase
    .from("customer_profiles")
    .select("display_name, email, phone, address_line1, address_line2, postal_code, city")
    .eq("user_id", user.id)
    .maybeSingle();

  const { firstName, lastName } = splitPersonName(cp?.display_name ?? "");

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Compte</p>
        <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tes informations de contact pour les artisans, devis et factures.
        </p>
      </div>

      <ContactSettingsForm
        initialValues={{
          firstName,
          lastName,
          email: cp?.email ?? user.email ?? null,
          phone: cp?.phone ?? null,
          addressLine1: cp?.address_line1 ?? null,
          addressLine2: cp?.address_line2 ?? null,
          postalCode: cp?.postal_code ?? null,
          city: cp?.city ?? null,
        }}
        displayNameLabel="Comment tu t’appelles"
        splitName
        emailEditable
        saveAction={updateCustomerSettings}
      />
    </div>
  );
}
