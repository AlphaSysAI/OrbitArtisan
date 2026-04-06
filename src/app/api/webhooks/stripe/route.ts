import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { revalidatePath } from "next/cache";

import { getStripe } from "@/lib/stripe/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function revalidateInvoicePaths(invoiceId: string) {
  revalidatePath("/compte");
  revalidatePath("/compte/factures");
  revalidatePath(`/compte/factures/${invoiceId}`);
  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoiceId}`);
}

async function markInvoicePaidFromSession(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoice_id;
  if (!invoiceId) return;

  const amountTotal = session.amount_total;
  if (amountTotal == null) return;

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error("[stripe webhook] SUPABASE_SERVICE_ROLE_KEY manquante ou invalide", e);
    return;
  }
  const { data: invoice } = await admin.from("invoices").select("id, grand_total, status").eq("id", invoiceId).maybeSingle();

  if (!invoice) return;
  if (invoice.status === "paid") return;

  if (invoice.grand_total !== amountTotal) {
    console.error("[stripe webhook] Montant incohérent", { invoiceId, db: invoice.grand_total, stripe: amountTotal });
    return;
  }

  const { error } = await admin
    .from("invoices")
    .update({ status: "paid" })
    .eq("id", invoiceId)
    .eq("status", "sent");

  if (error) {
    console.error("[stripe webhook] Mise à jour facture", error);
    return;
  }

  revalidateInvoicePaths(invoiceId);
}

async function syncStripeConnectAccount(account: Stripe.Account) {
  const stripeAccountId = account.id;
  const capabilities: any = (account as any).capabilities ?? {};
  const transfersStatus = capabilities?.transfers?.status;

  const stripeTransfersEnabled = transfersStatus === "active";
  // Simplification: on considère "payouts" comme activé quand "transfers" est actif.
  // (Stripe Connect Express autorise généralement le retrait quand la réception est active.)
  const stripePayoutsEnabled = stripeTransfersEnabled;

  const admin = createSupabaseAdminClient();
  await admin
    .from("profiles")
    .update({
      stripe_transfers_enabled: stripeTransfersEnabled,
      stripe_payouts_enabled: stripePayoutsEnabled,
      stripe_account_updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", stripeAccountId);
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET manquant");
    return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (e) {
    console.error("[stripe webhook] Signature invalide", e);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
        await markInvoicePaidFromSession(session);
      }
    } else if (event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      await markInvoicePaidFromSession(session);
    } else if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      await syncStripeConnectAccount(account);
    }
  } catch (e) {
    console.error("[stripe webhook] Erreur traitement", e);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
