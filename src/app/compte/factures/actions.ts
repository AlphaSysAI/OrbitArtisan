"use server";

import { redirect } from "next/navigation";

import { getPublicSiteUrl } from "@/lib/site-url";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function startInvoicePayment(formData: FormData): Promise<void> {
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  if (!invoiceId) redirect("/compte/factures?payment_error=missing");

  if (!isStripeConfigured()) {
    redirect(`/compte/factures/${invoiceId}?payment_error=stripe`);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/compte/factures");

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, customer_user_id, status, grand_total, invoice_number, artisan_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice || invoice.customer_user_id !== user.id) {
    redirect("/compte/factures?payment_error=forbidden");
  }
  if (invoice.status !== "sent") {
    redirect(`/compte/factures/${invoiceId}?payment_error=status`);
  }
  if ((invoice.grand_total ?? 0) <= 0) {
    redirect(`/compte/factures/${invoiceId}?payment_error=amount`);
  }

  const { data: artisan } = await supabase
    .from("profiles")
    .select("business_name, stripe_account_id, stripe_transfers_enabled")
    .eq("id", invoice.artisan_id)
    .maybeSingle();

  const stripeAccountId = artisan?.stripe_account_id ?? null;
  const transfersEnabled = !!artisan?.stripe_transfers_enabled;

  if (!stripeAccountId) {
    redirect(`/compte/factures/${invoiceId}?payment_error=stripe_connect_missing`);
  }

  if (!transfersEnabled) {
    redirect(`/compte/factures/${invoiceId}?payment_error=stripe_connect_not_ready`);
  }

  const stripe = getStripe();
  const origin = getPublicSiteUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    currency: "eur",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: invoice.grand_total,
          product_data: {
            name: `Facture ${invoice.invoice_number ?? invoice.id.slice(0, 8)}`,
            description: artisan?.business_name ?? "Prestation",
          },
        },
      },
    ],
    metadata: {
      invoice_id: invoice.id,
    },
    payment_intent_data: {
      // Aujourd'hui on fait simple : commission plateforme = 0.
      // Plus tard : si l'artisan n'est pas premium, on mettra application_fee_amount > 0.
      application_fee_amount: 0,
      transfer_data: {
        destination: stripeAccountId,
      },
      metadata: {
        invoice_id: invoice.id,
      },
    },
    customer_email: user.email ?? undefined,
    success_url: `${origin}/compte/factures/${invoice.id}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/compte/factures/${invoice.id}?payment=canceled`,
  });

  if (!session.url) {
    redirect(`/compte/factures/${invoiceId}?payment_error=session`);
  }

  redirect(session.url);
}
