"use client";

import { AlertTriangle, ArrowRight, HardHat, Loader2, Phone, RotateCcw, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { askClientAssistantAction, type AssistantSheetCard } from "@/app/compte/assistance-actions";
import { ConnectArtisanPanel, type ConnectionDefaults } from "@/components/client-space/connect-artisan-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ClientAssistantAnswer } from "@/lib/client-space/client-assistant";
import { CLIENT_LEVEL_LABEL } from "@/lib/technical-sheets/client/types";
import { cn } from "@/lib/utils";

type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; answer: ClientAssistantAnswer; sheets: AssistantSheetCard[] };

const STORAGE_KEY = "soline_client_assistant_v1";

const STARTERS = [
  "J'ai une fuite d'eau sous l'évier",
  "Le disjoncteur saute sans arrêt",
  "Mon radiateur reste froid",
  "Des taches noires apparaissent au plafond de la salle de bain",
];

function loadTurns(): Turn[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Turn[]) : [];
  } catch {
    return [];
  }
}

function saveTurns(turns: Turn[]) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-20)));
  } catch {
    /* navigation privée : la conversation n'est simplement pas gardée */
  }
}

function DangerBanner() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
      <span className="font-medium text-destructive">Danger : mettez-vous en sécurité d&apos;abord.</span>
      <span className="flex flex-wrap gap-2">
        <a href="tel:112" className="inline-flex items-center gap-1 rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-white">
          <Phone className="size-3" aria-hidden /> 112
        </a>
        <a href="tel:0800473333" className="inline-flex items-center gap-1 rounded-full border border-destructive px-3 py-1 text-xs font-semibold text-destructive">
          <Phone className="size-3" aria-hidden /> Gaz 0 800 47 33 33
        </a>
      </span>
    </div>
  );
}

function AssistantTurn({
  turn,
  defaults,
  isLast,
}: {
  turn: Extract<Turn, { role: "assistant" }>;
  defaults: ConnectionDefaults | null;
  isLast: boolean;
}) {
  const { answer, sheets } = turn;
  const [connectOpen, setConnectOpen] = React.useState(false);

  return (
    <div className="space-y-3">
      {answer.urgency === "danger" ? <DangerBanner /> : null}
      <div className="flex gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-card p-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
          {turn.content}
        </p>
      </div>

      {sheets.length > 0 ? (
        <ul className="grid gap-2 pl-11 sm:grid-cols-2">
          {sheets.map((sheet) => (
            <li key={sheet.id}>
              <Link
                href={`/compte/depannage/${sheet.id}`}
                className="group flex h-full items-start gap-2 rounded-xl border bg-card p-3 text-sm shadow-sm hover:border-primary/40"
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      sheet.level === "urgence" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {CLIENT_LEVEL_LABEL[sheet.level]}
                  </span>
                  <span className="block font-medium">{sheet.title}</span>
                </span>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {answer.trade && isLast ? (
        <div className="pl-11">
          {connectOpen ? (
            <ConnectArtisanPanel
              defaults={defaults}
              initialTrade={{ categoryId: answer.trade.categoryId, tradeId: answer.trade.tradeId }}
              initialDescription={answer.requestSummary ?? ""}
            />
          ) : answer.suggestPro ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
              <HardHat className="size-6 shrink-0 text-primary" aria-hidden />
              <p className="min-w-0 flex-1 text-sm">
                Un <strong>{answer.trade.label.toLowerCase()}</strong> peut s&apos;en occuper. On vous met en relation avec un
                artisan près de chez vous ?
              </p>
              <Button onClick={() => setConnectOpen(true)} className="shrink-0">
                Trouver un artisan
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConnectOpen(true)}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Ça ne suffit pas ? Faire venir un {answer.trade.label.toLowerCase()}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ClientAssistantChat({
  defaults,
  initialQuestion = "",
}: {
  defaults: ConnectionDefaults | null;
  /** Question posée depuis l'accueil (?q=…), envoyée automatiquement. */
  initialQuestion?: string;
}) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const endRef = React.useRef<HTMLDivElement>(null);
  const sentInitial = React.useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  const send = React.useCallback((text: string, history: Turn[]) => {
    const content = text.trim();
    if (!content) return;
    const next: Turn[] = [...history, { role: "user", content }];
    setTurns(next);
    setInput("");
    setError(null);
    startTransition(async () => {
      const res = await askClientAssistantAction(next.map((t) => ({ role: t.role, content: t.content })));
      if (!res.ok) {
        setError(res.message);
        return;
      }
      const withAnswer: Turn[] = [...next, { role: "assistant", content: res.answer.reply, answer: res.answer, sheets: res.sheets }];
      setTurns(withAnswer);
      saveTurns(withAnswer);
    });
  }, []);

  // Reprise de la conversation de l'onglet, ou question venue de l'accueil.
  React.useEffect(() => {
    if (sentInitial.current) return;
    sentInitial.current = true;
    const stored = loadTurns();
    if (initialQuestion.trim()) {
      send(initialQuestion, stored);
      // Question consommée : un rechargement ne la renvoie pas.
      router.replace(pathname, { scroll: false });
    } else if (stored.length) setTurns(stored);
  }, [initialQuestion, send, router, pathname]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, pending]);

  const lastAssistantIndex = turns.map((t) => t.role).lastIndexOf("assistant");

  return (
    <div className="space-y-5">
      {turns.length === 0 && !pending ? (
        <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
          <p className="font-medium">Décrivez votre souci, comme à un ami du métier.</p>
          <p className="text-sm text-muted-foreground">
            Soline vous dit quoi faire tout de suite, vous montre les fiches utiles et, si besoin, vous met en relation avec
            un artisan près de chez vous.
          </p>
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => send(starter, turns)}
                className="rounded-full border bg-background px-3 py-1.5 text-sm hover:bg-muted"
              >
                {starter}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-5">
        {turns.map((turn, index) =>
          turn.role === "user" ? (
            <div key={index} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap">
                {turn.content}
              </p>
            </div>
          ) : (
            <AssistantTurn key={index} turn={turn} defaults={defaults} isLast={index === lastAssistantIndex} />
          ),
        )}
        {pending ? (
          <p className="flex items-center gap-2 pl-11 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Soline réfléchit…
          </p>
        ) : null}
        {error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-3 space-y-2 rounded-2xl border bg-background/95 p-2 shadow-lg backdrop-blur"
        onSubmit={(event) => {
          event.preventDefault();
          send(input, turns);
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(input, turns);
              }
            }}
            rows={1}
            maxLength={1500}
            placeholder="Ex. : de l'eau coule du plafond de la cuisine…"
            className="min-h-11 resize-none border-0 shadow-none focus-visible:ring-0"
            aria-label="Votre message à l'assistant"
            disabled={pending}
          />
          <Button type="submit" size="icon" disabled={pending || !input.trim()} aria-label="Envoyer">
            <Send aria-hidden />
          </Button>
        </div>
        {turns.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setTurns([]);
              saveTurns([]);
            }}
            className="inline-flex items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" aria-hidden /> Nouvelle conversation
          </button>
        ) : null}
      </form>
      <p className="text-center text-xs text-muted-foreground">
        Soline donne des conseils de sécurité et de petit dépannage. En cas de danger, appelez le 112.
      </p>
    </div>
  );
}
