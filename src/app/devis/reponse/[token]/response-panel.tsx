"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageSquare, Phone, PhoneCall, X } from "lucide-react";

import type { GuestThreadMessage } from "@/lib/quotes/quote-response";

import { acceptQuoteAction, rejectQuoteAction, requestCallbackAction, sendGuestMessageAction } from "./actions";
import { formatDateTimeFr } from "@/lib/format/date";
import { formatPhoneFr } from "@/lib/phone";
import { VAT_CERTIFICATION_CHECKBOX } from "@/lib/billing/vat-certification";

const REASONS: { value: string; label: string }[] = [
  { value: "price", label: "Le prix" },
  { value: "delay", label: "Le délai" },
  { value: "other_provider", label: "J'ai choisi un autre professionnel" },
  { value: "project_cancelled", label: "Projet abandonné ou reporté" },
  { value: "other", label: "Autre raison" },
];

const ERRORS: Record<string, string> = {
  not_acceptable: "Ce devis n'est plus modifiable (déjà traité ou expiré). Rechargez la page.",
  certification_required: "Cochez la certification TVA : elle conditionne le taux réduit appliqué sur ce devis.",
  invalid_name: "Indiquez votre prénom et votre nom.",
  invalid_input: "Vérifiez les informations saisies.",
  rate_limited: "Trop de messages envoyés. Réessayez dans une heure ou appelez l'artisan.",
  not_found: "Ce devis est introuvable.",
};

type Step = "accept" | "reject" | "contact" | null;

export function QuoteResponsePanel(props: {
  token: string;
  accent: string;
  canRespond: boolean;
  artisanName: string;
  artisanPhone: string | null;
  defaultName: string;
  defaultPhone: string;
  callbackRequested: boolean;
  guestMessaging: boolean;
  thread: GuestThreadMessage[];
  /** Taux réduit : texte que le client certifie en acceptant (vide = taux normal). */
  vatCertificationLines: string[];
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(props.canRespond ? null : "contact");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [name, setName] = React.useState(props.defaultName);
  const [approved, setApproved] = React.useState(false);
  const [vatCertified, setVatCertified] = React.useState(false);
  const needsCertification = props.vatCertificationLines.length > 0;
  const [reason, setReason] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [phone, setPhone] = React.useState(props.defaultPhone ? formatPhoneFr(props.defaultPhone) : "");
  const [callbackSent, setCallbackSent] = React.useState(props.callbackRequested);
  const [message, setMessage] = React.useState("");

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    const res = await fn();
    setPending(false);
    if (!res.ok) {
      setError(ERRORS[res.error ?? ""] ?? "Une erreur est survenue. Réessayez.");
      return false;
    }
    setNotice(success);
    router.refresh();
    return true;
  }

  const primary = { backgroundColor: props.accent };

  return (
    <section className="space-y-3">
      {props.canRespond && step === null ? (
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => setStep("accept")}
            className="flex h-14 items-center justify-center gap-2 rounded-xl text-base font-semibold text-white shadow-sm"
            style={primary}
          >
            <Check className="size-5" /> Accepter le devis
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStep("contact")}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border bg-white text-sm font-semibold"
            >
              <MessageSquare className="size-4" /> Contacter
            </button>
            <button
              type="button"
              onClick={() => setStep("reject")}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border bg-white text-sm font-semibold text-slate-600"
            >
              <X className="size-4" /> Refuser
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p> : null}

      {step === "accept" && props.canRespond ? (
        <form
          className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => acceptQuoteAction(props.token, name, approved, vatCertified), "Merci ! Votre acceptation est enregistrée.");
          }}
        >
          <h2 className="text-lg font-semibold">Accepter le devis</h2>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Prénom et nom (vaut signature)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              minLength={2}
              maxLength={120}
              className="h-12 w-full rounded-lg border px-3 text-base outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
              className="mt-0.5 size-5 shrink-0"
            />
            <span>
              <strong>Lu et approuvé, bon pour accord.</strong> J&apos;ai reçu ce devis avant l&apos;exécution des travaux
              et j&apos;en accepte le contenu et le montant.
            </span>
          </label>
          {needsCertification ? (
            <div className="space-y-2 rounded-xl border bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-medium text-slate-800">TVA à taux réduit</p>
              {props.vatCertificationLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <label className="flex items-start gap-3 pt-1 text-sm text-slate-900">
                <input
                  type="checkbox"
                  checked={vatCertified}
                  onChange={(e) => setVatCertified(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0"
                />
                <span>{VAT_CERTIFICATION_CHECKBOX}</span>
              </label>
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || !approved || (needsCertification && !vatCertified) || name.trim().length < 2}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl font-semibold text-white disabled:opacity-50"
              style={primary}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Je signe et j&apos;accepte
            </button>
            <button type="button" onClick={() => setStep(null)} className="h-12 rounded-xl border px-4 text-sm">
              Retour
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Votre acceptation est horodatée et une copie du devis vous est envoyée par e-mail.
          </p>
        </form>
      ) : null}

      {step === "reject" && props.canRespond ? (
        <form
          className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => rejectQuoteAction(props.token, reason, comment), "Votre réponse a été transmise à l'artisan.");
          }}
        >
          <h2 className="text-lg font-semibold">Refuser le devis</h2>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Pour quelle raison ? (aide l&apos;artisan à s&apos;améliorer)</legend>
            {REASONS.map((r) => (
              <label
                key={r.value}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm ${reason === r.value ? "border-slate-900 bg-slate-50" : ""}`}
              >
                <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                {r.label}
              </label>
            ))}
          </fieldset>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Un commentaire ? (facultatif)"
            className="w-full rounded-lg border p-3 text-base"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || !reason}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 font-semibold text-white disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Confirmer le refus
            </button>
            <button type="button" onClick={() => setStep(null)} className="h-12 rounded-xl border px-4 text-sm">
              Retour
            </button>
          </div>
        </form>
      ) : null}

      {step === "contact" ? (
        <div className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Contacter {props.artisanName}</h2>
            {props.canRespond ? (
              <button type="button" onClick={() => setStep(null)} className="text-sm text-slate-500 underline">
                Retour
              </button>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {props.artisanPhone ? (
              <a
                href={`tel:${props.artisanPhone.replace(/[^\d+]/g, "")}`}
                className="flex h-12 items-center justify-center gap-2 rounded-xl font-semibold text-white"
                style={primary}
              >
                <Phone className="size-4" /> {formatPhoneFr(props.artisanPhone)}
              </a>
            ) : null}
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => requestCallbackAction(props.token, phone), "C'est noté, l'artisan va vous rappeler.").then(
                  (ok) => ok && setCallbackSent(true),
                );
              }}
            >
              {callbackSent ? (
                <p className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-50 text-sm font-medium text-emerald-900">
                  <PhoneCall className="size-4" /> Rappel demandé
                </p>
              ) : (
                <div className="flex gap-2 sm:col-span-2">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="Votre numéro"
                    required
                    className="h-12 min-w-0 flex-1 rounded-lg border px-3 text-base"
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    className="flex h-12 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
                  >
                    <PhoneCall className="size-4" /> Être rappelé
                  </button>
                </div>
              )}
            </form>
          </div>

          {props.guestMessaging ? (
            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-medium">Écrire à l&apos;artisan</p>
              {props.thread.length ? (
                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {props.thread.map((m) => (
                    <li
                      key={m.id}
                      className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${m.fromClient ? "ml-auto bg-slate-900 text-white" : "bg-slate-100"}`}
                    >
                      {m.body}
                      <span className="mt-1 block text-[11px] opacity-60">
                        {formatDateTimeFr(m.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () => sendGuestMessageAction(props.token, message),
                    "Message envoyé. La réponse de l'artisan vous parviendra par e-mail.",
                  ).then((ok) => ok && setMessage(""));
                }}
              >
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  required
                  placeholder="Une question sur le devis, une précision…"
                  className="w-full rounded-lg border p-3 text-base"
                />
                <button
                  type="submit"
                  disabled={pending || message.trim().length < 2}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 font-semibold text-white disabled:opacity-50"
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />} Envoyer
                </button>
              </form>
            </div>
          ) : (
            <p className="border-t pt-4 text-sm text-slate-600">
              Pour écrire à l&apos;artisan, utilisez la messagerie de votre espace client.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
