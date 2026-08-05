/**
 * Indexe les embeddings du catalogue fournisseur (Mistral mistral-embed, 1024 dims).
 * Usage: npx tsx scripts/seed-supplier-embeddings.ts
 * Requiert: MISTRAL_API_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const MISTRAL_EMBED_MODEL = "mistral-embed";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const key = t.slice(0, i).trim();
      const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* ignore */
  }
}

async function mistralEmbed(apiKey: string, text: string): Promise<number[]> {
  const res = await fetch("https://api.mistral.ai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MISTRAL_EMBED_MODEL, input: [text.trim().slice(0, 8000)] }),
  });
  if (!res.ok) throw new Error(`Mistral embed ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: { embedding?: number[] }[] };
  const vector = json.data?.[0]?.embedding;
  if (!vector?.length) throw new Error("empty embedding");
  return vector;
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mistralKey = process.env.MISTRAL_API_KEY;

if (!url || !serviceKey || !mistralKey) {
  console.error("Variables manquantes: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MISTRAL_API_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  console.log(`Modèle embeddings: ${MISTRAL_EMBED_MODEL}`);

  const { data: products, error } = await supabase
    .from("supplier_products")
    .select("id, title, sku")
    .is("embedding", null);

  if (error) {
    console.error("Fetch error:", error.message);
    process.exit(1);
  }

  if (!products?.length) {
    console.log("Aucun produit sans embedding — rien à faire.");
    return;
  }

  for (const p of products) {
    const vector = await mistralEmbed(mistralKey!, p.title);
    const { error: upErr } = await supabase
      .from("supplier_products")
      .update({ embedding: vector })
      .eq("id", p.id);

    if (upErr) console.error(`Update ${p.sku}:`, upErr.message);
    else console.log(`OK ${p.sku} (${vector.length} dims)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
