import { NextResponse } from "next/server";

import { buildQuoteFromText } from "@/lib/ai/build-quote-from-text";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatContactDisplayName } from "@/lib/contacts/display-name";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const conversationId = body?.conversationId ? String(body.conversationId) : "";

  if (!conversationId) {
    return NextResponse.json({ error: "missing_conversation_id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, description, labor_rate_per_hour")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) return NextResponse.json({ error: "not_artisan" }, { status: 403 });

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, artisan_id, customer_user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv || conv.artisan_id !== profile.id) {
    return NextResponse.json({ error: "conversation_forbidden" }, { status: 403 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("sender_user_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  const chatLines = (messages ?? []).map((m) => {
    const who = m.sender_user_id === user.id ? "Artisan" : "Client";
    return `${who}: ${m.body}`;
  });

  if (!chatLines.length) {
    return NextResponse.json({ error: "no_messages" }, { status: 400 });
  }

  const { data: catalogServices } = await supabase
    .from("services")
    .select("id, title, duration, price")
    .eq("artisan_id", profile.id)
    .order("title", { ascending: true });

  const { data: cp } = await supabase
    .from("customer_profiles")
    .select("display_name, email")
    .eq("user_id", conv.customer_user_id)
    .maybeSingle();

  const customerLabel = formatContactDisplayName({
    profileName: cp?.display_name,
    email: cp?.email,
  });

  try {
    const response = await buildQuoteFromText({
      supabase,
      instruction: chatLines.join("\n"),
      profile,
      services: catalogServices ?? [],
      customerLabel,
    });
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-quote-from-chat] error", message);

    if (message.includes("401") || message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "ai_auth_failed" }, { status: 502 });
    }
    if (message.includes("schema_validation_failed")) {
      return NextResponse.json({ error: "ai_schema_failed" }, { status: 500 });
    }
    if (message.includes("invalid_json") || message.includes("JSON")) {
      return NextResponse.json({ error: "ai_invalid_json" }, { status: 500 });
    }
    if (message === "empty_ai_response") {
      return NextResponse.json({ error: "empty_ai_response" }, { status: 500 });
    }
    return NextResponse.json({ error: "ai_parse_failed" }, { status: 500 });
  }
}
