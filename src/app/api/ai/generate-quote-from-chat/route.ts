import { NextResponse } from "next/server";
import { buildMaterialSearchQuery, embedText } from "@/lib/ai/embeddings";
import { mistralChatParse } from "@/lib/ai/mistral";
import { laborMinutesFromItems, matchServiceIdsByTitles } from "@/lib/ai/match-services";
import {
  QUOTE_EXTRACTION_JSON_SCHEMA,
  QuoteExtractionSchema,
  type GenerateQuoteFromChatResponse,
  type MatchedSupplierMaterial,
} from "@/lib/ai/quote-from-chat-schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatContactDisplayName } from "@/lib/contacts/display-name";

export const runtime = "nodejs";
export const maxDuration = 60;

type SupplierMatchRow = {
  id: string;
  title: string;
  price: number | string;
  url: string;
  sku: string;
  similarity: number;
};

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

  const services = catalogServices ?? [];
  const catalogList =
    services.length > 0
      ? services.map((s) => `- ${s.title} (${s.duration} min)`).join("\n")
      : "(aucune prestation configurée)";

  const { data: cp } = await supabase
    .from("customer_profiles")
    .select("display_name, email")
    .eq("user_id", conv.customer_user_id)
    .maybeSingle();

  const customerLabel = formatContactDisplayName({
    profileName: cp?.display_name,
    email: cp?.email,
  });

  const laborRateEur =
    profile.labor_rate_per_hour != null ? (profile.labor_rate_per_hour / 100).toFixed(2) : "non renseigné";

  const systemPrompt = `Tu es un expert en chiffrage pour artisans du bâtiment en France.
Analyse la conversation et extrais un brouillon de devis structuré.
Ne invente pas de matériaux absents de la discussion. Si aucun matériau n'est mentionné, retourne needed_materials vide.
Pour catalog_service_titles, choisis uniquement parmi les titres du catalogue fourni (orthographe proche acceptée).
Pour labor_items, quantity = heures estimées, unit_price = taux horaire suggéré en euros (utilise ${laborRateEur} €/h si cohérent).
notes : synthèse courte pour le devis (max 500 caractères).`;

  const userPrompt = `Artisan: ${profile.business_name}
${profile.description ? `Description: ${profile.description}` : ""}
Client: ${customerLabel}
Taux horaire artisan: ${laborRateEur} €/h

Catalogue prestations disponibles:
${catalogList}

Conversation:
${chatLines.join("\n")}`;

  let extraction;
  try {
    extraction = await mistralChatParse(
      QuoteExtractionSchema,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      "quote_extraction",
      {
        temperature: 0.2,
        jsonSchema: QUOTE_EXTRACTION_JSON_SCHEMA,
        jsonExample: `{
  "labor_items": [{ "description": "Pose carrelage", "quantity": 4, "unit_price": 45 }],
  "catalog_service_titles": ["Pose carrelage"],
  "needed_materials": [{ "name_generic": "Colle carrelage", "quantity": 2, "specifications": "25 kg" }],
  "notes": "Synthèse du besoin et points à valider."
}`,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-quote-from-chat] parse error", message);

    if (message.includes("401") || message.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "ai_auth_failed" }, { status: 502 });
    }
    if (message.includes("schema_validation_failed")) {
      return NextResponse.json({ error: "ai_schema_failed" }, { status: 500 });
    }
    if (message.includes("invalid_json") || message.includes("JSON")) {
      return NextResponse.json({ error: "ai_invalid_json" }, { status: 500 });
    }
    return NextResponse.json({ error: "ai_parse_failed" }, { status: 500 });
  }

  if (!extraction) {
    return NextResponse.json({ error: "empty_ai_response" }, { status: 500 });
  }

  const warnings: string[] = [];
  const laborDurationMinutes = laborMinutesFromItems(extraction.labor_items);

  const matchedServiceIds = matchServiceIdsByTitles(
    services,
    extraction.catalog_service_titles,
    extraction.labor_items.map((l) => l.description),
  );

  if (!matchedServiceIds.length && services.length > 0) {
    warnings.push("Aucune prestation du catalogue n'a pu être associée automatiquement — sélectionnez-les manuellement.");
  }

  if (laborDurationMinutes <= 0 && extraction.labor_items.length > 0) {
    warnings.push("Durée de main d'œuvre non calculée — vérifiez les heures dans le formulaire.");
  }

  const supplierMaterials: MatchedSupplierMaterial[] = [];

  for (const material of extraction.needed_materials) {
    const query = buildMaterialSearchQuery(material.name_generic, material.specifications);
    let match: MatchedSupplierMaterial["match"] = null;

    try {
      const embedding = await embedText(query);
      if (embedding.length) {
        const { data: matches, error: rpcErr } = await supabase.rpc("match_supplier_products", {
          query_embedding: embedding,
          match_count: 1,
          match_threshold: 0.35,
        });

        if (rpcErr) {
          console.error("[generate-quote-from-chat] rpc error", rpcErr);
          warnings.push(`Recherche fournisseur indisponible pour « ${material.name_generic} ».`);
        } else {
          const best = (matches as SupplierMatchRow[] | null)?.[0];
          if (best) {
            const priceNum = typeof best.price === "string" ? Number(best.price) : best.price;
            match = {
              id: best.id,
              title: best.title,
              price_eur: Number.isFinite(priceNum) ? priceNum : 0,
              url: best.url,
              sku: best.sku,
              similarity: best.similarity,
            };
          } else {
            warnings.push(`Aucun produit fournisseur trouvé pour « ${material.name_generic} ».`);
          }
        }
      }
    } catch (err) {
      console.error("[generate-quote-from-chat] embedding error", err);
      warnings.push(`Erreur d'indexation pour « ${material.name_generic} ».`);
    }

    supplierMaterials.push({
      requested_name: material.name_generic,
      quantity: material.quantity,
      specifications: material.specifications,
      match,
    });
  }

  if (!extraction.needed_materials.length) {
    warnings.push("Aucun matériau détecté dans la discussion.");
  }

  const response: GenerateQuoteFromChatResponse = {
    labor_items: extraction.labor_items,
    catalog_service_titles: extraction.catalog_service_titles,
    matched_service_ids: matchedServiceIds,
    labor_duration_minutes: laborDurationMinutes,
    notes: extraction.notes,
    supplier_materials: supplierMaterials,
    warnings,
  };

  return NextResponse.json(response);
}
