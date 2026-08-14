"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ArrowUp,
  CalendarPlus,
  FileText,
  Loader2,
  Mic,
  MicOff,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { AssistantApiResponse } from "@/lib/ai/assistant-schema";
import { aiErrorMessage } from "@/lib/ai/error-messages";
import { persistAiQuoteDraft } from "@/lib/ai/map-quote-draft";
import { formatIsoDateFr } from "@/lib/ai/resolve-date";
import { Button } from "@/components/ui/button";
import { computeAnchoredPanelRect, type AnchorRect } from "@/lib/ui/anchor-panel";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: AssistantApiResponse["action"];
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

/** Nombre de relances sans parole avant de couper le micro. */
const MAX_SILENT_RESTARTS = 6;

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const STARTERS = [
  "Crée un devis pour mon client…",
  "Ouvre mes rendez-vous",
  "Montre mes factures",
];

export function ArtisanAssistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelRect, setPanelRect] = useState<AnchorRect | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
        content:
          "Pose-moi une question ou une action. Ex. « Ai-je des RDV les 27 et 28 août ? » ou « Crée un devis pour Dupont : mur 50 m ».",
    },
  ]);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = !!getSpeechRecognition();

  // Mode mains libres : le micro se relance seul après chaque réponse.
  const handsFreeRef = useRef(false);
  const openRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const silentRunsRef = useRef(0);
  const sendMessageRef = useRef<(raw: string) => Promise<void>>(async () => {});
  const startListeningRef = useRef<() => void>(() => {});

  const stopListening = useCallback(() => {
    handsFreeRef.current = false;
    silentRunsRef.current = 0;
    setHandsFree(false);
    setListening(false);

    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // déjà arrêté
      }
    }
  }, []);

  const scheduleRestart = useCallback((delayMs: number) => {
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      if (handsFreeRef.current && openRef.current) startListeningRef.current();
    }, delayMs);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      toast.error("La dictée n’est pas supportée sur ce navigateur.");
      handsFreeRef.current = false;
      setHandsFree(false);
      return;
    }

    if (recognitionRef.current) return;

    const recognition = new Ctor();
    recognition.lang = "fr-FR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    let finalTranscript = "";

    recognition.onresult = (event) => {
      // `results` est cumulatif : on reconstruit à chaque événement.
      let finals = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finals += result[0].transcript;
        else interim += result[0].transcript;
      }
      finalTranscript = finals;
      setInput((finals || interim).trim());
    };

    recognition.onerror = (event) => {
      const code = event?.error;
      // Silence / arrêt volontaire : on laisse `onend` gérer la relance.
      if (code === "no-speech" || code === "aborted") return;

      if (code === "not-allowed" || code === "service-not-allowed") {
        stopListening();
        toast.error("Accès au micro refusé — autorise-le dans ton navigateur.");
        return;
      }
      toast.error("Dictée interrompue.");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);

      const text = finalTranscript.trim();

      if (text) {
        silentRunsRef.current = 0;
        void (async () => {
          await sendMessageRef.current(text);
          if (handsFreeRef.current && openRef.current) scheduleRestart(500);
        })();
        return;
      }

      if (!handsFreeRef.current || !openRef.current) return;

      silentRunsRef.current += 1;
      if (silentRunsRef.current >= MAX_SILENT_RESTARTS) {
        stopListening();
        toast.message("Micro en pause", {
          description: "Je n’ai rien entendu depuis un moment. Réactive-le quand tu veux.",
        });
        return;
      }
      scheduleRestart(300);
    };

    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
      if (handsFreeRef.current) scheduleRestart(400);
    }
  }, [scheduleRestart, stopListening]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  useEffect(() => {
    openRef.current = open;
    if (!open) stopListening();
  }, [open, stopListening]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, loading]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelRect(null);
      return;
    }

    function update() {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      setPanelRect(
        computeAnchoredPanelRect({
          trigger,
          preferredWidth: 420,
          preferredMaxHeight: Math.min(window.innerHeight * 0.72, 520),
          side: "above",
          align: "end",
        }),
      );
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    return () => stopListening();
  }, [stopListening]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  });

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  async function sendMessage(raw: string) {
    const message = raw.trim();
    if (!message || loading) return;

    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-u`, role: "user", content: message },
    ]);
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.action);
      const pendingAction =
        lastAssistant?.action?.type === "navigate"
          ? {
              type: "navigate" as const,
              href: lastAssistant.action.href,
              label: lastAssistant.action.label,
            }
          : lastAssistant?.action?.type === "open_quote_form"
            ? { type: "open_quote_form" as const, href: lastAssistant.action.href, label: "Devis" }
            : null;

      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, pendingAction }),
      });
      const json = (await res.json().catch(() => null)) as
        | (AssistantApiResponse & { error?: string })
        | null;

      if (!res.ok || !json?.reply) {
        toast.error(aiErrorMessage(json?.error));
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-e`,
            role: "assistant",
            content: aiErrorMessage(json?.error, "Je n’ai pas pu traiter ça. Réessaie."),
          },
        ]);
        return;
      }

      if (json.action?.type === "open_quote_form") {
        persistAiQuoteDraft(json.action.draft);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: "assistant",
          content: json.reply,
          action: json.action,
        },
      ]);

      // Navigation : ouverture immédiate (plus de « prêt à y aller ? »)
      if (json.action?.type === "navigate" && json.action.auto !== false) {
        const href = json.action.href;
        window.setTimeout(() => {
          // En mains libres, on garde le panneau ouvert pour ne pas couper le micro.
          if (!handsFreeRef.current) setOpen(false);
          router.push(href);
        }, 450);
      }
    } catch {
      toast.error("Impossible de joindre l’assistant.");
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          role: "assistant",
          content: "Problème réseau — réessaie dans un instant.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function toggleListen() {
    if (handsFree || listening) {
      stopListening();
      return;
    }
    handsFreeRef.current = true;
    silentRunsRef.current = 0;
    setHandsFree(true);
    startListening();
  }

  function runAction(action: NonNullable<AssistantApiResponse["action"]>) {
    if (action.type === "open_quote_form") {
      persistAiQuoteDraft(action.draft);
      setOpen(false);
      router.push(action.href);
      return;
    }
    if (action.type === "open_appointment_form") {
      setOpen(false);
      router.push(action.href);
      return;
    }
    if (action.type === "navigate") {
      setOpen(false);
      router.push(action.href);
      return;
    }
    if (action.type === "answer" && action.href) {
      setOpen(false);
      router.push(action.href);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed z-50 inline-flex h-14 items-center gap-2.5 rounded-2xl border-2 border-brand bg-brand px-4",
          "right-4 bottom-4 sm:right-6 sm:bottom-6",
          "font-display text-base font-semibold tracking-tight text-brand-foreground",
          "shadow-[0_10px_30px_oklch(0.55_0.13_55/0.4)] transition-transform hover:scale-[1.03]",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/35",
          open && "ring-4 ring-brand/30",
        )}
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        aria-expanded={open}
        aria-label={open ? "Fermer l’assistant Orbit IA" : "Ouvrir l’assistant Orbit IA"}
      >
        {open ? (
          <X className="size-5 shrink-0" strokeWidth={2.5} />
        ) : (
          <Sparkles className="size-5 shrink-0" strokeWidth={2.5} />
        )}
        <span>Orbit IA</span>
      </button>

      {mounted && open && panelRect
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Assistant Orbit IA"
              className="fixed z-[60] flex flex-col overflow-hidden rounded-3xl border border-brand/30 bg-background shadow-[0_20px_60px_rgb(0_0_0/0.22)]"
              style={{
                top: panelRect.top,
                left: panelRect.left,
                width: panelRect.width,
                height: panelRect.maxHeight,
              }}
            >
              <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 bg-gradient-to-br from-brand/15 via-brand/5 to-transparent px-4 py-3.5">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm">
                      <Sparkles className="size-4" />
                    </span>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
                      Assistant
                    </p>
                  </div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">Orbit IA</h2>
                  <p className="text-xs text-muted-foreground">Voix ou texte · tu valides avant envoi</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(false)}
                  aria-label="Fermer"
                >
                  <X className="size-4" />
                </Button>
              </header>

              <div
                ref={listRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
              >
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>

                      {m.action?.type === "open_quote_form" ? (
                        <div className="mt-3 space-y-2 rounded-xl border border-border/60 bg-background/80 p-3 text-foreground">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <FileText className="size-4 text-brand" />
                            Devis à valider
                          </div>
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            {m.action.preview.customerName ? (
                              <li>Client : {m.action.preview.customerName}</li>
                            ) : null}
                            {m.action.preview.serviceTitles.length ? (
                              <li>Prestations : {m.action.preview.serviceTitles.join(", ")}</li>
                            ) : (
                              <li>Prestations : à sélectionner</li>
                            )}
                            <li>Matériaux : {m.action.preview.materialsCount}</li>
                            {m.action.preview.laborHours != null ? (
                              <li>Main d’œuvre ~ {m.action.preview.laborHours} h</li>
                            ) : null}
                          </ul>
                          <Button
                            type="button"
                            size="sm"
                            className="mt-1 w-full"
                            onClick={() => runAction(m.action!)}
                          >
                            Ouvrir le devis prérempli
                          </Button>
                        </div>
                      ) : null}

                      {m.action?.type === "open_appointment_form" ? (
                        <div className="mt-3 space-y-2 rounded-xl border border-border/60 bg-background/80 p-3 text-foreground">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <CalendarPlus className="size-4 text-brand" />
                            Rendez-vous à confirmer
                          </div>
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            <li>Client : {m.action.preview.customerName ?? "à compléter"}</li>
                            {m.action.preview.dateIso ? (
                              <li>
                                Quand : {formatIsoDateFr(m.action.preview.dateIso)}
                                {m.action.preview.time ? ` à ${m.action.preview.time.replace(":", "h")}` : ""}
                              </li>
                            ) : null}
                            {m.action.preview.warnings.map((w) => (
                              <li key={w} className="text-warning">
                                {w}
                              </li>
                            ))}
                          </ul>
                          <Button
                            type="button"
                            size="sm"
                            className="mt-1 w-full"
                            onClick={() => runAction(m.action!)}
                          >
                            Vérifier et enregistrer
                          </Button>
                        </div>
                      ) : null}

                      {m.action?.type === "navigate" && !m.action.auto ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="mt-3 w-full"
                          onClick={() => runAction(m.action!)}
                        >
                          Aller à {m.action.label}
                        </Button>
                      ) : null}
                      {m.action?.type === "navigate" && m.action.auto ? (
                        <p className="mt-2 text-xs opacity-70">Ouverture en cours…</p>
                      ) : null}
                      {m.action?.type === "answer" && m.action.href ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-3 w-full"
                          onClick={() => {
                            setOpen(false);
                            router.push(m.action!.href!);
                          }}
                        >
                          {m.action.label ?? "Voir dans l’app"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Je prépare ça…
                  </div>
                ) : null}
              </div>

              {!messages.some((m) => m.role === "user") ? (
                <div className="flex shrink-0 flex-wrap gap-2 border-t border-border/50 px-4 py-2.5">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setInput(s)}
                      className="rounded-full border border-border/70 bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-brand/40 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : null}

              {handsFree ? (
                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-brand/25 bg-brand/10 px-4 py-2">
                  <span className="flex items-center gap-2 text-xs font-semibold text-brand">
                    <span
                      className={cn(
                        "size-2 rounded-full bg-brand",
                        listening && "animate-pulse",
                      )}
                    />
                    {listening
                      ? "Micro ouvert — parle, j’envoie tout seul"
                      : loading
                        ? "Je réponds, puis je réouvre le micro…"
                        : "Mains libres actif"}
                  </span>
                  <button
                    type="button"
                    onClick={stopListening}
                    className="text-xs font-semibold text-brand underline-offset-2 hover:underline"
                  >
                    Couper
                  </button>
                </div>
              ) : null}

              <form
                className="flex shrink-0 items-end gap-2 border-t border-border/70 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage(input);
                }}
              >
                {speechSupported ? (
                  <Button
                    type="button"
                    variant={handsFree ? "default" : "outline"}
                    size="icon"
                    className={cn(
                      "size-11 shrink-0",
                      handsFree && "bg-brand text-brand-foreground hover:bg-brand/90",
                      listening && "ring-4 ring-brand/25",
                    )}
                    onClick={toggleListen}
                    aria-pressed={handsFree}
                    aria-label={handsFree ? "Couper la dictée mains libres" : "Activer la dictée mains libres"}
                    title={handsFree ? "Couper le micro" : "Dictée mains libres"}
                  >
                    {handsFree ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                  </Button>
                ) : null}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={2}
                  placeholder={
                    listening
                      ? "Écoute en cours…"
                      : handsFree
                        ? "Mains libres — parle quand tu veux"
                        : "Écris ou dicte ta demande…"
                  }
                  className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage(input);
                      return;
                    }
                    // On bascule en saisie clavier : le micro ne doit plus écraser le texte.
                    if (handsFree && (e.key.length === 1 || e.key === "Backspace")) {
                      stopListening();
                    }
                  }}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="size-11 shrink-0 bg-brand text-brand-foreground hover:bg-brand/90"
                  disabled={loading || !input.trim()}
                  aria-label="Envoyer"
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                </Button>
              </form>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
