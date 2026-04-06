"use client";

import * as React from "react";
import { toast } from "sonner";
import Link from "next/link";
import { FileText, Loader2, Send } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { sendMessage, type MessageRow } from "@/lib/messages/actions";
import { cn } from "@/lib/utils";

export function ArtisanThreadClient({
  conversationId,
  viewerUserId,
  showQuoteShortcut = true,
  sentOnLeft = false,
}: {
  conversationId: string;
  viewerUserId: string;
  /** Raccourci « Créer un devis » (réservé à l’artisan). */
  showQuoteShortcut?: boolean;
  /** Si true, les messages envoyés par l'utilisateur courant s'affichent à gauche. */
  sentOnLeft?: boolean;
}) {
  const [messages, setMessages] = React.useState<MessageRow[]>([]);
  const [draft, setDraft] = React.useState("");
  const [aiLoading, setAiLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const lastMessageIdRef = React.useRef<string | null>(null);
  const supabaseRef = React.useRef(createSupabaseBrowserClient());

  const refreshMessages = React.useCallback(async () => {
    const { data, error } = await supabaseRef.current
      .from("messages")
      .select("id, conversation_id, sender_user_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) return { ok: false as const, messages: [] as MessageRow[] };
    return { ok: true as const, messages: (data ?? []) as MessageRow[] };
  }, [conversationId]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const listed = await refreshMessages();
      if (!cancelled && listed.ok) {
        setMessages(listed.messages);
        lastMessageIdRef.current = listed.messages.at(-1)?.id ?? null;
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, refreshMessages]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  React.useEffect(() => {
    const channel = supabaseRef.current
      .channel(`artisan-messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async () => {
          const listed = await refreshMessages();
          if (listed.ok) {
            setMessages(listed.messages);
            lastMessageIdRef.current = listed.messages.at(-1)?.id ?? null;
          }
        },
      )
      .subscribe();
    return () => {
      supabaseRef.current.removeChannel(channel);
    };
  }, [conversationId, refreshMessages]);

  // Fallback robuste: si le realtime n'arrive pas (latence, canal perdu, config),
  // on recharge périodiquement le fil pour afficher les nouveaux messages sans refresh manuel.
  React.useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const listed = await refreshMessages();
      if (!listed.ok || cancelled) return;

      const latestId = listed.messages.at(-1)?.id ?? null;
      if (latestId && latestId !== lastMessageIdRef.current) {
        setMessages(listed.messages);
        lastMessageIdRef.current = latestId;
      }
    };

    const interval = window.setInterval(() => {
      void refresh();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [conversationId, refreshMessages]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    const res = await sendMessage(conversationId, draft);
    setSending(false);
    if (!res.ok) {
      toast.error("Envoi impossible.");
      return;
    }
    setDraft("");
    const listed = await refreshMessages();
    if (listed.ok) {
      setMessages(listed.messages);
      lastMessageIdRef.current = listed.messages.at(-1)?.id ?? null;
    }
  }

  async function onAiSuggest() {
    if (!draft.trim()) {
      // Pas bloquant: l'IA peut proposer quand même, mais on réduit le risque d'écraser.
    }
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error ? `IA: ${json.error}` : "IA: erreur");
        return;
      }
      const suggestion = String(json?.suggestion ?? "");
      if (!suggestion.trim()) {
        toast.error("IA: réponse vide");
        return;
      }
      setDraft(suggestion);
      toast.success("Réponse IA proposée.");
    } catch {
      toast.error("IA: impossible de proposer une réponse.");
    } finally {
      setAiLoading(false);
    }
  }

  function onDraftKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (sending || !draft.trim()) return;
    e.currentTarget.form?.requestSubmit();
  }

  return (
    <div className="flex max-h-[min(520px,70vh)] flex-col overflow-hidden rounded-2xl border bg-card">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading &&
          messages.map((m) => {
            const mine = m.sender_user_id === viewerUserId;
            const isLeft = mine ? sentOnLeft : !sentOnLeft;
            return (
              <div key={m.id} className={cn("flex", isLeft ? "justify-start" : "justify-end")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  {m.body}
                </div>
              </div>
            );
          })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={onSend} className="border-t p-3">
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onDraftKeyDown}
            placeholder="Votre réponse…"
            rows={2}
            className="min-h-[44px] resize-none"
          />
          <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={sending || !draft.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onAiSuggest} disabled={aiLoading} className="gap-2">
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Proposer une réponse IA
          </Button>
          <p className="text-xs text-muted-foreground">Astuce: tu peux relire et corriger avant d’envoyer.</p>
        </div>
      </form>
      {showQuoteShortcut && (
        <div className="border-t bg-muted/20 p-3">
          <Link
            href={`/app/quotes/new?conversationId=${encodeURIComponent(conversationId)}`}
            className={buttonVariants({ variant: "outline", className: "w-full gap-2 justify-center" })}
          >
            <FileText className="h-4 w-4" />
            Créer un devis
          </Link>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Le nom et l&apos;email du client seront préremplis depuis son inscription.
          </p>
        </div>
      )}
    </div>
  );
}
