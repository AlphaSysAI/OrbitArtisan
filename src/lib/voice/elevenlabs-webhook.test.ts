import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { parsePostCallTranscription, verifyElevenLabsSignature } from "./elevenlabs-webhook";

const secret = "wsec_test";
const body = JSON.stringify({ type: "post_call_transcription" });
const now = 1_790_000_000;
const sign = (t: number, raw = body) =>
  `t=${t},v0=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;

describe("verifyElevenLabsSignature", () => {
  it("accepte une signature valide", () => {
    expect(verifyElevenLabsSignature({ rawBody: body, signatureHeader: sign(now), secret, nowSeconds: now })).toBe(true);
  });
  it("refuse un corps modifié, un secret faux ou un en-tête absent", () => {
    expect(verifyElevenLabsSignature({ rawBody: body + " ", signatureHeader: sign(now), secret, nowSeconds: now })).toBe(false);
    expect(verifyElevenLabsSignature({ rawBody: body, signatureHeader: sign(now), secret: "autre", nowSeconds: now })).toBe(false);
    expect(verifyElevenLabsSignature({ rawBody: body, signatureHeader: null, secret, nowSeconds: now })).toBe(false);
  });
  it("refuse une signature trop ancienne (rejeu)", () => {
    expect(verifyElevenLabsSignature({ rawBody: body, signatureHeader: sign(now - 3600), secret, nowSeconds: now })).toBe(false);
  });
});

describe("parsePostCallTranscription", () => {
  it("extrait numéros, transcript et champs collectés", () => {
    const parsed = parsePostCallTranscription({
      type: "post_call_transcription",
      data: {
        conversation_id: "conv_1",
        transcript: [
          { role: "agent", message: "Bonjour, entreprise Dupont." },
          { role: "user", message: "Je voudrais refaire ma salle de bain." },
          { role: "agent", message: null },
        ],
        metadata: { phone_call: { agent_number: "+33900000000", external_number: "+33600000000", call_sid: "CA1" } },
        conversation_initiation_client_data: { dynamic_variables: { system__called_number: "+33911111111" } },
        analysis: {
          transcript_summary: "Rénovation salle de bain.",
          data_collection_results: { customer_email: { value: "jean@exemple.fr" } },
        },
      },
    });
    expect(parsed).toMatchObject({
      conversationId: "conv_1",
      calledNumber: "+33911111111",
      callerNumber: "+33600000000",
      callSid: "CA1",
      hasCallerSpeech: true,
      summary: "Rénovation salle de bain.",
      customerEmail: "jean@exemple.fr",
      customerName: null,
    });
    expect(parsed?.transcript).toBe("Soline : Bonjour, entreprise Dupont.\nAppelant : Je voudrais refaire ma salle de bain.");
  });
  it("ignore les autres types d'événements", () => {
    expect(parsePostCallTranscription({ type: "post_call_audio" })).toBeNull();
  });
});
