import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhooks ElevenLabs (agents) : vérification de signature et lecture du
 * payload « post_call_transcription ». Module pur, testable sans réseau.
 *
 * En-tête `elevenlabs-signature: t=<unix>,v0=<hex>` où
 * hex = HMAC-SHA256(secret, `${t}.${corps brut}`).
 */
const ELEVENLABS_SIGNATURE_TOLERANCE_SECONDS = 30 * 60;

export function verifyElevenLabsSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  nowSeconds?: number;
}): boolean {
  const header = params.signatureHeader?.trim();
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const timestamp = Number(parts.t);
  const provided = parts.v0;
  if (!Number.isFinite(timestamp) || !provided) return false;

  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > ELEVENLABS_SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", params.secret).update(`${timestamp}.${params.rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

type TranscriptTurn = { role?: string; message?: string | null };

type ParsedPostCall = {
  conversationId: string | null;
  calledNumber: string | null;
  callerNumber: string | null;
  callSid: string | null;
  /** Transcription lisible « Appelant : … / Soline : … ». */
  transcript: string;
  /** L'appelant a-t-il dit quelque chose d'exploitable ? */
  hasCallerSpeech: boolean;
  summary: string | null;
  customerName: string | null;
  customerEmail: string | null;
};

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Valeur d'un champ « Data collection » configuré sur l'agent (ex. customer_email). */
function dataCollectionValue(analysis: Record<string, unknown>, key: string): string | null {
  const results = record(analysis.data_collection_results);
  const entry = record(results[key]);
  return str(entry.value);
}

export function parsePostCallTranscription(payload: unknown): ParsedPostCall | null {
  const root = record(payload);
  if (root.type !== "post_call_transcription") return null;

  const data = record(root.data);
  const metadata = record(data.metadata);
  const phoneCall = record(metadata.phone_call);
  const dynamicVariables = record(record(data.conversation_initiation_client_data).dynamic_variables);
  const analysis = record(data.analysis);

  const turns = Array.isArray(data.transcript) ? (data.transcript as TranscriptTurn[]) : [];
  const lines: string[] = [];
  let hasCallerSpeech = false;
  for (const turn of turns) {
    const message = str(turn?.message);
    if (!message) continue;
    const isCaller = turn.role === "user";
    if (isCaller) hasCallerSpeech = true;
    lines.push(`${isCaller ? "Appelant" : "Soline"} : ${message}`);
  }

  return {
    conversationId: str(data.conversation_id),
    calledNumber: str(dynamicVariables.system__called_number) ?? str(phoneCall.agent_number),
    callerNumber: str(dynamicVariables.system__caller_id) ?? str(phoneCall.external_number),
    callSid: str(dynamicVariables.system__call_sid) ?? str(phoneCall.call_sid),
    transcript: lines.join("\n"),
    hasCallerSpeech,
    summary: str(analysis.transcript_summary),
    customerName: dataCollectionValue(analysis, "customer_name"),
    customerEmail: dataCollectionValue(analysis, "customer_email"),
  };
}
