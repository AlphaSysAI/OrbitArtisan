"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  acceptQuoteByLink,
  postGuestMessage,
  rejectQuoteByLink,
  requestCallbackByLink,
  type ResponseResult,
} from "@/lib/quotes/quote-response";
import { verifyQuoteResponseToken } from "@/lib/quotes/response-link";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

function resolve(token: string) {
  const id = verifyQuoteResponseToken(token);
  const db = createSupabaseServiceRoleClient();
  return id && db ? { id, db } : null;
}

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

function done(token: string, res: ResponseResult): ResponseResult {
  if (res.ok) revalidatePath(`/devis/reponse/${token}`);
  return res;
}

export async function acceptQuoteAction(token: string, signerName: string, approved: boolean): Promise<ResponseResult> {
  const r = resolve(token);
  if (!r) return { ok: false, error: "not_found" };
  if (!approved) return { ok: false, error: "invalid_input" };
  const h = await headers();
  return done(
    token,
    await acceptQuoteByLink(r.db, r.id, { signerName, ip: await clientIp(), userAgent: h.get("user-agent") }),
  );
}

export async function rejectQuoteAction(token: string, reason: string, comment: string): Promise<ResponseResult> {
  const r = resolve(token);
  if (!r) return { ok: false, error: "not_found" };
  return done(token, await rejectQuoteByLink(r.db, r.id, { reason, comment }));
}

export async function requestCallbackAction(token: string, phone: string): Promise<ResponseResult> {
  const r = resolve(token);
  if (!r) return { ok: false, error: "not_found" };
  return done(token, await requestCallbackByLink(r.db, r.id, phone));
}

export async function sendGuestMessageAction(token: string, body: string): Promise<ResponseResult> {
  const r = resolve(token);
  if (!r) return { ok: false, error: "not_found" };
  return done(token, await postGuestMessage(r.db, r.id, body));
}
