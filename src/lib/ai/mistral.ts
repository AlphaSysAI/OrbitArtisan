import "server-only";

import { z } from "zod";

const MISTRAL_API_BASE = "https://api.mistral.ai/v1";

/**
 * Modèle chat (surchargeable via MISTRAL_CHAT_MODEL).
 *
 * Fallback défensif : "open-mistral-nemo" est déprécié côté Mistral depuis le
 * 22/05/2026 (date déjà passée) — le garder comme valeur par défaut ferait
 * échouer silencieusement tout appel IA (assistant, devis vocal/chat,
 * qualification lead) sur un environnement où la variable d'env n'est pas
 * positionnée (preview Vercel, nouvel environnement, oubli de config).
 * "mistral-small-latest" est le choix par défaut le plus sûr : alias
 * toujours à jour, adapté à de l'extraction/classification, coût le plus bas.
 * Positionner MISTRAL_CHAT_MODEL=mistral-large-latest pour plus de qualité.
 */
export const MISTRAL_CHAT_MODEL = process.env.MISTRAL_CHAT_MODEL?.trim() || "mistral-small-latest";

export const MISTRAL_EMBED_MODEL = "mistral-embed";

/** Dimension des embeddings `mistral-embed` (pgvector). */
export const MISTRAL_EMBED_DIMENSIONS = 1024;

/**
 * Timeouts réseau (Point 14 audit pré-pilote — fiabilité appel vocal en direct).
 * Sans timeout, un appel Mistral qui traîne bloque toute la requête voix jusqu'à
 * la limite dure de la fonction (maxDuration), au lieu d'échouer proprement et
 * de laisser le fallback (brouillon vide + warning) prendre le relais.
 */
const MISTRAL_CHAT_TIMEOUT_MS = 20_000;
const MISTRAL_EMBED_TIMEOUT_MS = 10_000;

export type MistralChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function getApiKey(): string {
  const key = process.env.MISTRAL_API_KEY?.trim();
  if (!key) throw new Error("Missing env var: MISTRAL_API_KEY");
  return key;
}

type ResponseFormat =
  | "text"
  | "json_object"
  | { type: "json_schema"; name: string; schema: Record<string, unknown>; strict?: boolean };

export function parseJsonFromLlm(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/im);
  const body = (fenced?.[1] ?? trimmed).trim();
  return JSON.parse(body);
}

export async function mistralChat(params: {
  messages: MistralChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ResponseFormat;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: MISTRAL_CHAT_MODEL,
    messages: params.messages,
    temperature: params.temperature ?? 0.3,
    max_tokens: params.maxTokens ?? 4096,
  };

  const rf = params.responseFormat ?? "text";
  if (rf === "json_object") {
    body.response_format = { type: "json_object" };
  } else if (rf !== "text") {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: rf.name,
        strict: rf.strict ?? false,
        schema: rf.schema,
      },
    };
  }

  const res = await fetch(`${MISTRAL_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(MISTRAL_CHAT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Mistral chat ${res.status}: ${errText.slice(0, 800)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("empty_mistral_response");
  }
  return content;
}

export async function mistralChatText(
  messages: MistralChatMessage[],
  temperature = 0.3,
): Promise<string> {
  return mistralChat({ messages, temperature, responseFormat: "text" });
}

export async function mistralChatParse<T extends z.ZodType>(
  schema: T,
  messages: MistralChatMessage[],
  schemaName: string,
  options?: {
    temperature?: number;
    jsonSchema?: Record<string, unknown>;
    jsonExample?: string;
  },
): Promise<z.infer<T>> {
  const temperature = options?.temperature ?? 0.2;
  const jsonSchema = options?.jsonSchema;
  const jsonExample = options?.jsonExample;

  const jsonInstruction: MistralChatMessage = {
    role: "system",
    content: `Tu dois répondre UNIQUEMENT avec un objet JSON valide (sans markdown, sans texte autour).
Respecte strictement le schéma « ${schemaName} » (noms de champs et types).
Structure attendue (forme uniquement — valeurs tirées du contexte, ne recopie pas les exemples) :
${jsonExample ?? JSON.stringify(jsonSchema ?? {}, null, 2)}`,
  };

  const attempts: ResponseFormat[] = [
    "json_object",
    ...(jsonSchema
      ? [{ type: "json_schema" as const, name: schemaName, schema: jsonSchema, strict: false }]
      : []),
  ];

  let lastError: Error | null = null;

  for (const responseFormat of attempts) {
    try {
      const raw = await mistralChat({
        messages: [jsonInstruction, ...messages],
        temperature,
        responseFormat,
      });

      const parsed = parseJsonFromLlm(raw);
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;

      console.error("[mistral] validation", result.error.flatten());
      lastError = new Error("schema_validation_failed");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error("[mistral] parse attempt failed", lastError.message);
    }
  }

  throw lastError ?? new Error("mistral_parse_failed");
}

export async function mistralEmbed(text: string): Promise<number[]> {
  const input = text.trim().slice(0, 8000);
  if (!input) return [];

  const res = await fetch(`${MISTRAL_API_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MISTRAL_EMBED_MODEL,
      input: [input],
    }),
    signal: AbortSignal.timeout(MISTRAL_EMBED_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Mistral embed ${res.status}: ${errText.slice(0, 500)}`);
  }

  const json = (await res.json()) as { data?: { embedding?: number[] }[] };
  const vector = json.data?.[0]?.embedding;
  if (!Array.isArray(vector) || !vector.length) {
    throw new Error("empty_embedding");
  }
  return vector;
}
