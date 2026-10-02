import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  MessageSquareText,
  PhoneCall,
  PhoneIncoming,
  Receipt,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { InboxItem, InboxKind, InboxTone } from "@/lib/clients/inbox";
import { cn } from "@/lib/utils";
import { formatDateFr } from "@/lib/format/date";

const ICON: Record<InboxKind, LucideIcon> = {
  call: PhoneIncoming,
  callback: PhoneCall,
  message: MessageSquareText,
  quote_accepted: CheckCircle2,
  quote_rejected: XCircle,
  appointment: CalendarClock,
  invoice_late: Receipt,
};

const TONE: Record<InboxTone, string> = {
  danger: "border-l-red-500 [&_[data-icon]]:text-red-600",
  warning: "border-l-amber-500 [&_[data-icon]]:text-amber-600",
  success: "border-l-emerald-500 [&_[data-icon]]:text-emerald-600",
  info: "border-l-sky-500 [&_[data-icon]]:text-sky-600",
};

function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return formatDateFr(iso, { day: "numeric", month: "short" });
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

/** Liste « À traiter » : une ligne = une action, ouverte en un tap ; la fiche client en second lien. */
export function InboxList({ items }: { items: InboxItem[] }) {
  if (!items.length) {
    return (
      <div className="app-surface flex items-center gap-3 p-5 text-sm text-muted-foreground">
        <CheckCircle2 className="size-5 text-emerald-600" /> Rien en attente pour le moment.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const Icon = it.tone === "danger" && it.kind === "call" ? AlertTriangle : ICON[it.kind];
        return (
          <li key={it.key} className={cn("app-surface flex items-stretch overflow-hidden border-l-4 p-0", TONE[it.tone])}>
            <Link href={it.href} className="flex min-w-0 flex-1 items-start gap-3 p-4">
              <Icon data-icon className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-semibold">
                    {it.clientName ? `${it.clientName} · ` : ""}
                    <span className="font-normal">{it.title}</span>
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">{ago(it.at)}</span>
                </div>
                {it.detail ? <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{it.detail}</p> : null}
              </div>
            </Link>
            {it.clientId ? (
              <Link
                href={`/app/clients/${it.clientId}`}
                className="hidden shrink-0 items-center border-l px-4 text-xs font-medium text-muted-foreground hover:text-foreground sm:flex"
              >
                Fiche client
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
