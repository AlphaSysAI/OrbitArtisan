"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, PhoneCall } from "lucide-react";
import { toast } from "sonner";

import { markCallbackHandled, markQuoteAcceptedByArtisan, markQuoteRejectedByArtisan } from "@/app/app/quotes/response-actions";
import { Button } from "@/components/ui/button";
import { formatDateTimeFr } from "@/lib/format/date";
import { formatPhoneFr } from "@/lib/phone";

const REASON_LABELS: Record<string, string> = {
  price: "Le prix",
  delay: "Le délai",
  other_provider: "Autre professionnel choisi",
  project_cancelled: "Projet abandonné ou reporté",
  other: "Autre raison",
};

const CHANNEL_LABELS: Record<string, string> = {
  email_link: "en ligne, depuis le lien du devis",
  account: "en ligne, depuis son espace client",
  artisan_paper: "signature papier enregistrée par vous",
  artisan_oral: "accord oral enregistré par vous",
};

const ERRORS: Record<string, string> = {
  invalid_name: "Indique le nom du signataire.",
  not_acceptable: "Ce devis n'est plus en attente de réponse.",
  scan_too_large: "Fichier trop lourd (5 Mo max).",
  scan_invalid: "Fichier non reconnu (photo JPEG/PNG ou PDF).",
  scan_upload_failed: "Envoi du fichier impossible. Réessaie.",
};

function when(iso: string) {
  return formatDateTimeFr(iso, { dateStyle: "medium", timeStyle: "short" });
}

/** Photo de chantier → JPEG ≤ 1600 px : léger à envoyer en 4G. Les PDF passent tels quels. */
async function compressIfImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = rej;
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], "devis-signe.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function QuoteClientResponseCard(props: {
  quoteId: string;
  status: string;
  viewedAt: string | null;
  defaultSignerName: string;
  callback: { requestedAt: string; handledAt: string | null; phone: string | null } | null;
  rejection: { reason: string | null; comment: string | null } | null;
  acceptance: { channel: string | null; scanUrl: string | null } | null;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"accept" | "reject" | null>(null);
  const [pending, setPending] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [comment, setComment] = React.useState("");

  async function onAccept(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const scan = fd.get("scan");
    if (scan instanceof File && scan.size > 0) fd.set("scan", await compressIfImage(scan));
    setPending(true);
    const res = await markQuoteAcceptedByArtisan(fd);
    setPending(false);
    if (!res.ok) return void toast.error(ERRORS[res.error] ?? "Enregistrement impossible.");
    toast.success("Devis marqué comme accepté : tu peux le facturer.");
    setMode(null);
    router.refresh();
  }

  async function onReject(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await markQuoteRejectedByArtisan(props.quoteId, reason, comment);
    setPending(false);
    if (!res.ok) return void toast.error(ERRORS[res.error] ?? "Enregistrement impossible.");
    toast.message("Devis marqué comme refusé.");
    setMode(null);
    router.refresh();
  }

  async function onCallbackDone() {
    setPending(true);
    const res = await markCallbackHandled(props.quoteId);
    setPending(false);
    if (res.ok) router.refresh();
  }

  const callbackOpen = props.callback && !props.callback.handledAt;

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Réponse du client</p>

      {props.status === "sent" ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          {props.viewedAt ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          {props.viewedAt ? `Consulté le ${when(props.viewedAt)}` : "Pas encore consulté en ligne"}
        </p>
      ) : null}

      {callbackOpen ? (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="font-medium">📞 Demande de rappel · {when(props.callback!.requestedAt)}</p>
          <div className="flex flex-wrap gap-2">
            {props.callback!.phone ? (
              <a
                href={`tel:${props.callback!.phone}`}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 font-medium text-background"
              >
                <PhoneCall className="size-4" /> Rappeler le {formatPhoneFr(props.callback!.phone)}
              </a>
            ) : null}
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void onCallbackDone()}>
              C&apos;est fait
            </Button>
          </div>
        </div>
      ) : null}

      {props.status === "rejected" && props.rejection ? (
        <p>
          Motif : <strong>{REASON_LABELS[props.rejection.reason ?? ""] ?? "non précisé"}</strong>
          {props.rejection.comment ? <span className="mt-1 block italic text-muted-foreground">« {props.rejection.comment} »</span> : null}
        </p>
      ) : null}

      {props.status === "accepted" && props.acceptance ? (
        <p className="text-muted-foreground">
          Accepté {CHANNEL_LABELS[props.acceptance.channel ?? ""] ?? ""}.
          {props.acceptance.scanUrl ? (
            <>
              {" "}
              <a href={props.acceptance.scanUrl} target="_blank" rel="noopener" className="font-medium text-foreground underline">
                Voir le devis signé
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {props.status === "sent" && mode === null ? (
        <div className="grid gap-2">
          <Button type="button" variant="outline" onClick={() => setMode("accept")}>
            Signé sur papier / accord oral
          </Button>
          <Button type="button" variant="ghost" className="text-muted-foreground" onClick={() => setMode("reject")}>
            Le client a refusé
          </Button>
        </div>
      ) : null}

      {mode === "accept" ? (
        <form onSubmit={(e) => void onAccept(e)} className="space-y-3">
          <input type="hidden" name="quote_id" value={props.quoteId} />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 rounded-md border p-2">
              <input type="radio" name="channel" value="artisan_paper" defaultChecked /> Signé sur papier
            </label>
            <label className="flex items-center gap-2 rounded-md border p-2">
              <input type="radio" name="channel" value="artisan_oral" /> Accord oral
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Nom du signataire</span>
            <input name="signer_name" defaultValue={props.defaultSignerName} required minLength={2} className="h-10 w-full rounded-md border bg-background px-3" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Date de l&apos;accord</span>
            <input
              name="signed_on"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="h-10 w-full rounded-md border bg-background px-3"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Photo du devis signé (conseillé, preuve en cas de litige)</span>
            <input name="scan" type="file" accept="image/*,application/pdf" capture="environment" className="block w-full text-sm" />
          </label>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Enregistrer l&apos;accord
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "reject" ? (
        <form onSubmit={(e) => void onReject(e)} className="space-y-3">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            className="h-10 w-full rounded-md border bg-background px-2"
          >
            <option value="">Motif…</option>
            {Object.entries(REASON_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="Précision (facultatif)"
            className="w-full rounded-md border bg-background p-2"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" className="flex-1" disabled={pending || !reason}>
              Marquer comme refusé
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode(null)}>
              Annuler
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
