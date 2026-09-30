"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

import { markVoiceIntakeRead } from "./actions";

/**
 * Carte repliable d'un appel. Le premier dépliage marque le résumé comme lu
 * (appel serveur silencieux, sans rechargement : l'état est mis à jour localement).
 */
export function VoiceIntakeCard({
  intakeId,
  unread,
  urgent,
  header,
  children,
}: {
  intakeId: string;
  unread: boolean;
  urgent: boolean;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [isUnread, setIsUnread] = React.useState(unread);
  const bodyId = `intake-${intakeId}`;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && isUnread) {
      setIsUnread(false);
      void markVoiceIntakeRead(intakeId);
    }
  }

  return (
    <li className={cn("app-surface overflow-hidden", urgent && "border-2 border-red-500")}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-start gap-3 p-4 text-left sm:p-5"
      >
        <span
          aria-hidden
          className={cn("mt-2 size-2.5 shrink-0 rounded-full", isUnread ? "bg-brand" : "bg-transparent")}
        />
        <div className={cn("min-w-0 flex-1", isUnread && "[&_[data-title]]:font-bold")}>
          {isUnread ? <span className="sr-only">Non lu. </span> : null}
          {header}
        </div>
        <ChevronDown
          aria-hidden
          className={cn("mt-1 size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div id={bodyId} className="space-y-4 border-t border-border/60 px-4 pb-5 pt-4 sm:px-5">
          {children}
        </div>
      ) : null}
    </li>
  );
}
