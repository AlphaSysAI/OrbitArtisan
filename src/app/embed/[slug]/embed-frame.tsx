"use client";

import * as React from "react";
import { X } from "lucide-react";

import { EMBED_MESSAGE_NAMESPACE, type EmbedTheme } from "@/lib/leads/embed";
import { cn } from "@/lib/utils";

/**
 * Enveloppe du widget dans l'iframe : force le thème demandé par l'artisan,
 * publie sa hauteur au parent (auto-resize) et relaie la fermeture.
 *
 * Les messages partent en `*` : la page hôte est un site tiers dont on ne
 * connaît pas l'origine. Seule une hauteur transite, jamais de donnée du lead.
 */
export function EmbedFrame({
  theme,
  header,
  children,
}: {
  theme: EmbedTheme;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const node = rootRef.current;
    if (!node || window.parent === window) return;

    let lastHeight = 0;
    const publish = () => {
      const height = Math.ceil(node.getBoundingClientRect().height);
      if (!height || Math.abs(height - lastHeight) < 2) return;
      lastHeight = height;
      window.parent.postMessage({ type: `${EMBED_MESSAGE_NAMESPACE}:height`, height }, "*");
    };

    const observer = new ResizeObserver(publish);
    observer.observe(node);
    publish();
    window.parent.postMessage({ type: `${EMBED_MESSAGE_NAMESPACE}:ready` }, "*");

    return () => observer.disconnect();
  }, []);

  function close() {
    if (window.parent === window) return;
    window.parent.postMessage({ type: `${EMBED_MESSAGE_NAMESPACE}:close` }, "*");
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex min-h-fit flex-col bg-background text-foreground",
        theme === "light" && "light",
        theme === "dark" && "dark",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        {header}
        <button
          type="button"
          onClick={close}
          aria-label="Fermer"
          className="-mr-1 shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-5">{children}</div>
    </div>
  );
}
