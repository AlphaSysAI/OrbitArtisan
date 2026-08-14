"use client";

import * as React from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StepShell } from "@/components/trades/trade-picker";
import { MAX_LEAD_CHAT_QUESTIONS, type LeadChatMessage } from "@/lib/leads/chat-schema";
import { cn } from "@/lib/utils";

export function ChatStep({
  tradeLabel,
  onBack,
  onDone,
}: {
  tradeLabel: string;
  onBack: () => void;
  onDone: (description: string, messages: LeadChatMessage[]) => void;
}) {
  const [messages, setMessages] = React.useState<LeadChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [finished, setFinished] = React.useState(false);
  const [description, setDescription] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);
  const startedRef = React.useRef(false);

  const ask = React.useCallback(
    async (history: LeadChatMessage[]) => {
      setLoading(true);
      try {
        const res = await fetch("/api/estimation/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tradeLabel, messages: history }),
        });
        const json = (await res.json()) as {
          question?: string | null;
          done?: boolean;
          summary?: string;
        };

        if (json.question) {
          setMessages([...history, { role: "assistant", content: json.question }]);
          return;
        }

        setMessages(history);
        setFinished(true);
        setDescription(
          (json.summary ?? "").trim() ||
            history
              .filter((m) => m.role === "user")
              .map((m) => m.content)
              .join(" "),
        );
      } catch {
        // Réseau indisponible : on laisse le prospect décrire librement.
        setMessages(history);
        setFinished(true);
        setDescription(
          history
            .filter((m) => m.role === "user")
            .map((m) => m.content)
            .join(" "),
        );
      } finally {
        setLoading(false);
      }
    },
    [tradeLabel],
  );

  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void ask([]);
  }, [ask]);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function answer() {
    const content = input.trim();
    if (!content || loading) return;
    setInput("");
    void ask([...messages, { role: "user", content }]);
  }

  const answered = messages.filter((m) => m.role === "user").length;

  return (
    <StepShell title="Décris ton besoin" subtitle={tradeLabel} onBack={onBack}>
      <div className="rounded-2xl border bg-card">
        <div ref={listRef} className="max-h-[46vh] space-y-3 overflow-y-auto p-4">
          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <p
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {m.content}
              </p>
            </div>
          ))}

          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {messages.length ? "Je note…" : "Je prépare ma première question…"}
            </p>
          )}

          {!messages.length && !loading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              Réponds en quelques mots, ça suffit.
            </p>
          )}
        </div>

        {!finished && (
          <div className="flex items-end gap-2 border-t p-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  answer();
                }
              }}
              placeholder="Ta réponse…"
              disabled={loading}
              autoFocus
            />
            <Button
              type="button"
              size="icon"
              className="size-11 shrink-0"
              onClick={answer}
              disabled={loading || !input.trim()}
              aria-label="Envoyer"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {!finished && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Question {Math.min(answered + 1, MAX_LEAD_CHAT_QUESTIONS)} sur {MAX_LEAD_CHAT_QUESTIONS} maximum
          </span>
          {answered > 0 && (
            <button
              type="button"
              className="underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => {
                setFinished(true);
                setDescription(
                  messages
                    .filter((m) => m.role === "user")
                    .map((m) => m.content)
                    .join(" "),
                );
              }}
            >
              Passer les questions
            </button>
          )}
        </div>
      )}

      {finished && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="lead_description">Ta demande, telle qu’elle sera transmise</Label>
            <Textarea
              id="lead_description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Complète ou reformule librement…"
              maxLength={4000}
            />
            <p className="text-xs text-muted-foreground">
              Tu peux tout modifier : c’est ce texte que les artisans liront.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={description.trim().length < 10}
            onClick={() => onDone(description.trim(), messages)}
          >
            Continuer
          </Button>
        </div>
      )}
    </StepShell>
  );
}
