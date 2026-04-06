"use client";

import * as React from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getOrCreateConversation,
  sendMessage,
  type MessageRow,
} from "@/lib/messages/actions";
import { cn } from "@/lib/utils";

export function VitrineMessages({
  artisanId,
  slug,
  accent,
  demoMode,
  isOwner,
  viewerUserId,
}: {
  artisanId: string;
  slug: string;
  accent: string;
  demoMode: boolean;
  isOwner: boolean;
  viewerUserId: string | null;
}) {
  const [loading, setLoading] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<MessageRow[]>([]);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const lastMessageIdRef = React.useRef<string | null>(null);
  const supabaseRef = React.useRef(createSupabaseBrowserClient());

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const refreshMessages = React.useCallback(async (convId: string) => {
    const { data, error } = await supabaseRef.current
      .from("messages")
      .select("id, conversation_id, sender_user_id, body, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });

    if (error) return { ok: false as const, messages: [] as MessageRow[] };
    return { ok: true as const, messages: (data ?? []) as MessageRow[] };
  }, []);

  React.useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  React.useEffect(() => {
    if (demoMode || isOwner || !viewerUserId) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await getOrCreateConversation(artisanId);
      if (cancelled) return;
      setLoading(false);
      if (!res.ok || !("conversationId" in res) || !res.conversationId) {
        if (res.ok === false && "error" in res && res.error === "own_page") return;
        toast.error("Impossible d’ouvrir la conversation.");
        return;
      }
      setConversationId(res.conversationId);
      const listed = await refreshMessages(res.conversationId);
      if (listed.ok) {
        setMessages(listed.messages);
        lastMessageIdRef.current = listed.messages.at(-1)?.id ?? null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artisanId, demoMode, isOwner, viewerUserId, refreshMessages]);

  React.useEffect(() => {
    if (!conversationId || demoMode) return;
    const channel = supabaseRef.current
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async () => {
          const listed = await refreshMessages(conversationId);
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
  }, [conversationId, demoMode, refreshMessages]);

  // Fallback de polling: évite le refresh manuel si le realtime est capricieux.
  React.useEffect(() => {
    if (!conversationId || demoMode) return;
    let cancelled = false;

    const refresh = async () => {
      const listed = await refreshMessages(conversationId);
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
  }, [conversationId, demoMode, refreshMessages]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!conversationId || !draft.trim()) return;
    setSending(true);
    const res = await sendMessage(conversationId, draft, slug);
    setSending(false);
    if (!res.ok) {
      toast.error("Envoi impossible. Réessaie.");
      return;
    }
    setDraft("");
    const listed = await refreshMessages(conversationId);
    if (listed.ok) {
      setMessages(listed.messages);
      lastMessageIdRef.current = listed.messages.at(-1)?.id ?? null;
    }
  }

  function onDraftKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (sending || !draft.trim()) return;
    e.currentTarget.form?.requestSubmit();
  }

  if (demoMode) {
    return (
      <section className="space-y-4">
        <div className="text-center">
          <h3 className="text-2xl font-bold text-neutral-900">Échangeons sur vos demandes</h3>
          <p className="mt-2 text-neutral-600">Posez vos questions avant de réserver — comme sur Doctolib.</p>
        </div>
        <div className="overflow-hidden rounded-3xl border border-dashed border-amber-300/80 bg-white/90 p-4 shadow-inner">
          <div className="flex max-h-[320px] flex-col gap-3 overflow-y-auto rounded-2xl bg-neutral-50/80 p-4">
            <Bubble align="left" name="Artisan" accent={accent}>
              Bonjour ! Dites-moi ce dont vous avez besoin, je vous réponds vite.
            </Bubble>
            <Bubble align="right" name="Vous" accent={accent}>
              Bonjour, j’aurais une question sur un dépannage…
            </Bubble>
          </div>
          <p className="mt-4 text-center text-sm text-amber-800/90">
            Mode démo — inscris-toi en compte <strong>client</strong> pour de vrais échanges sur une page vitrine.
          </p>
        </div>
      </section>
    );
  }

  if (isOwner) {
    return (
      <section className="space-y-4">
        <div className="text-center">
          <h3 className="text-2xl font-bold text-neutral-900">Échangeons sur vos demandes</h3>
          <p className="mt-2 text-neutral-600">Tes clients écrivent ici ; tu réponds depuis ton espace.</p>
        </div>
        <div
          className="rounded-3xl border bg-white p-8 text-center shadow-sm"
          style={{ borderColor: `${accent}40` }}
        >
          <p className="text-neutral-700">C’est ta page : les messages clients sont dans ton espace.</p>
          <Link
            href="/app/messages"
            className={buttonVariants({ className: "mt-4" })}
            style={{ backgroundColor: accent, color: "#fff", borderColor: accent }}
          >
            Ouvrir mes conversations
          </Link>
        </div>
      </section>
    );
  }

  if (!viewerUserId) {
    const next = `/site/${slug}`;
    return (
      <section className="space-y-4">
        <div className="text-center">
          <h3 className="text-2xl font-bold text-neutral-900">Échangeons sur vos demandes</h3>
          <p className="mt-2 text-neutral-600">
            Crée un compte gratuit (client) pour échanger avec cet artisan, puis réserve un créneau ci-dessous.
          </p>
        </div>
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-3xl border bg-white p-8 shadow-sm sm:flex-row"
          style={{ borderColor: `${accent}40` }}
        >
          <Link
            href={`/inscription-client?next=${encodeURIComponent(next)}`}
            className={buttonVariants()}
            style={{ backgroundColor: accent, color: "#fff", borderColor: accent }}
          >
            Créer un compte client
          </Link>
          <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonVariants({ variant: "outline" })}>
            J’ai déjà un compte
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="text-center">
        <h3 className="text-2xl font-bold text-neutral-900">Échangeons sur vos demandes</h3>
        <p className="mt-2 text-neutral-600">Un fil de discussion privé avec l’artisan — avant ou après réservation.</p>
      </div>

      <div
        className="flex max-h-[min(420px,55vh)] flex-col overflow-hidden rounded-3xl border bg-white shadow-lg"
        style={{ borderColor: `${accent}35`, boxShadow: `0 20px 50px -15px ${accent}30` }}
      >
        <div className="border-b border-neutral-100 bg-neutral-50/90 px-4 py-3 text-center text-xs text-neutral-500">
          Messages visibles par vous et l’artisan uniquement
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
            </div>
          )}
          {!loading && messages.length === 0 && (
            <p className="py-8 text-center text-sm text-neutral-500">
              Écrivez un premier message pour démarrer la conversation.
            </p>
          )}
          {!loading &&
            messages.map((m) => {
              const mine = m.sender_user_id === viewerUserId;
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                      mine ? "rounded-br-md text-white" : "rounded-bl-md bg-neutral-100 text-neutral-900",
                    )}
                    style={
                      mine
                        ? { backgroundColor: accent }
                        : undefined
                    }
                  >
                    {m.body}
                  </div>
                </div>
              );
            })}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={onSend} className="border-t border-neutral-100 bg-white p-3">
          <div className="flex gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onDraftKeyDown}
              placeholder="Votre message…"
              rows={2}
              className="min-h-[44px] resize-none"
              maxLength={8000}
            />
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11 shrink-0"
              disabled={sending || !draft.trim()}
              style={{ backgroundColor: accent, color: "#fff" }}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

function Bubble({
  align,
  name,
  accent,
  children,
}: {
  align: "left" | "right";
  name: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1", align === "right" ? "items-end" : "items-start")}>
      <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">{name}</span>
      <div
        className={cn(
          "max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          align === "right" ? "rounded-br-sm text-white" : "rounded-bl-sm bg-white text-neutral-800 shadow",
        )}
        style={align === "right" ? { backgroundColor: accent } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
