"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Archive, ArchiveRestore, Check, Keyboard, Loader2, Mic, Pencil, Square, Undo2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  archiveVoiceIntake,
  correctVoiceIntakeByAudio,
  correctVoiceIntakeByText,
  dismissVoiceIntake,
  restoreVoiceIntake,
  undoVoiceIntakeCorrection,
  validateVoiceIntakeQuote,
} from "./actions";

const VAT_CHOICES = [
  { value: "20", label: "20 %" },
  { value: "10", label: "10 %" },
  { value: "5.5", label: "5,5 %" },
];

const CORRECTION_ERRORS: Record<string, string> = {
  audio_invalid: "Enregistrement trop court ou illisible. Réessaie.",
  transcription_failed: "Je n'ai pas pu écouter le vocal (réseau ?). Réessaie ou écris la consigne.",
  empty: "Je n'ai rien entendu. Parle plus près du micro.",
  patch_failed: "Modification impossible pour l'instant. Réessaie.",
  not_editable: "Cet appel a déjà été traité.",
};

function pickAudioMime(): { mime: string; ext: string } {
  if (typeof MediaRecorder !== "undefined") {
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return { mime: "audio/webm;codecs=opus", ext: "webm" };
    if (MediaRecorder.isTypeSupported("audio/mp4")) return { mime: "audio/mp4", ext: "m4a" };
  }
  return { mime: "", ext: "webm" };
}

/**
 * Validation « spéciale chantier » : 3 gros boutons, utilisables d'une main avec des gants.
 * Valider & envoyer · Modifier au micro · Rejeter. La saisie clavier reste un repli.
 */
export function VoiceIntakeActions({
  intakeId,
  canValidate,
  canUndo = false,
  vatFranchise = false,
}: {
  intakeId: string;
  canValidate: boolean;
  canUndo?: boolean;
  /** Franchise 293 B : pas de choix de TVA (imposée à 0 % par la base). */
  vatFranchise?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"validate" | "dismiss" | "patch" | null>(null);
  const [vatRate, setVatRate] = React.useState("20");
  const [recording, setRecording] = React.useState(false);
  const [seconds, setSeconds] = React.useState(0);
  const [typed, setTyped] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ transcript: string; changes: string[]; warnings: string[] } | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function handleValidate() {
    setPending("validate");
    const res = await validateVoiceIntakeQuote(intakeId, Number(vatRate));
    setPending(null);
    if (!res.ok) {
      toast.error(res.hint ?? "Impossible de valider ce devis.", { description: res.error });
      return;
    }
    if (!res.emailSent) {
      toast.warning("Devis créé, mais l'email n'a pas pu être envoyé.", {
        description: "Renvoie le lien depuis la fiche devis.",
      });
    } else {
      toast.success("Devis envoyé au client.");
    }
    router.refresh();
  }

  async function handleDismiss() {
    setPending("dismiss");
    const res = await dismissVoiceIntake(intakeId);
    setPending(null);
    if (!res.ok) {
      toast.error("Impossible de classer cet appel.");
      return;
    }
    toast.message("Appel classé sans suite.", { description: "Retrouvable dans l'onglet Archivés." });
    router.refresh();
  }

  function showResult(res: Awaited<ReturnType<typeof correctVoiceIntakeByText>>) {
    if (!res.ok) {
      toast.error(CORRECTION_ERRORS[res.error] ?? "Modification impossible.");
      return;
    }
    setResult({ transcript: res.transcript, changes: res.changes, warnings: res.warnings });
    if (!res.changes.length) toast.message("Aucune modification appliquée.");
    router.refresh();
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { mime, ext } = pickAudioMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
        const type = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(chunks, { type: type.split(";")[0] });
        const fd = new FormData();
        fd.set("audio", new File([blob], `consigne.${ext}`, { type: blob.type }));
        setPending("patch");
        const res = await correctVoiceIntakeByAudio(intakeId, fd);
        setPending(null);
        showResult(res);
      };
      recorderRef.current = recorder;
      recorder.start();
      setSeconds(0);
      setRecording(true);
      setResult(null);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s >= 59 && recorder.state === "recording") recorder.stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error("Micro indisponible : autorise-le ou écris la consigne.");
      setTyped("");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function submitTyped() {
    if (!typed?.trim()) return;
    setPending("patch");
    const res = await correctVoiceIntakeByText(intakeId, typed);
    setPending(null);
    if (res.ok) setTyped(null);
    showResult(res);
  }

  async function handleUndo() {
    setPending("patch");
    const res = await undoVoiceIntakeCorrection(intakeId);
    setPending(null);
    if (res.ok) {
      setResult(null);
      toast.message("Correction annulée.");
      router.refresh();
    }
  }

  const busy = pending !== null || recording;
  const big = "flex h-16 flex-col items-center justify-center gap-1 rounded-xl text-sm font-semibold disabled:opacity-50";

  return (
    <div className="space-y-3">
      {result ? (
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3 text-sm">
          <p className="italic text-muted-foreground">« {result.transcript} »</p>
          {result.changes.map((c) => (
            <p key={c} className="font-medium text-emerald-700 dark:text-emerald-400">{c}</p>
          ))}
          {result.warnings.map((w) => (
            <p key={w} className="text-amber-700 dark:text-amber-400">{w}</p>
          ))}
        </div>
      ) : null}

      {typed !== null ? (
        <div className="flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Ex. ajoute 2 sacs de colle, main-d'œuvre à 400 €"
            className="h-11 min-w-0 flex-1 rounded-md border bg-transparent px-3 text-base"
            autoFocus
          />
          <Button type="button" disabled={pending !== null || !typed.trim()} onClick={() => void submitTyped()}>
            OK
          </Button>
        </div>
      ) : null}

      {vatFranchise ? null : (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        TVA
        {VAT_CHOICES.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => setVatRate(v.value)}
            className={cn("rounded-full border px-2.5 py-1", vatRate === v.value && "border-foreground bg-foreground text-background")}
          >
            {v.label}
          </button>
        ))}
      </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className={cn(big, "bg-primary text-primary-foreground")}
          disabled={!canValidate || busy}
          onClick={() => void handleValidate()}
        >
          {pending === "validate" ? <Loader2 className="size-5 animate-spin" /> : <Check className="size-5" />}
          Valider &amp; envoyer
        </button>
        {recording ? (
          <button type="button" className={cn(big, "animate-pulse bg-red-600 text-white")} onClick={stopRecording}>
            <Square className="size-5" />
            Stop · 0:{String(seconds).padStart(2, "0")}
          </button>
        ) : (
          <button type="button" className={cn(big, "border-2")} disabled={busy} onClick={() => void startRecording()}>
            {pending === "patch" ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
            {pending === "patch" ? "Je modifie…" : "Modifier au micro"}
          </button>
        )}
        <button type="button" className={cn(big, "border text-muted-foreground")} disabled={busy} onClick={() => void handleDismiss()}>
          {pending === "dismiss" ? <Loader2 className="size-5 animate-spin" /> : <X className="size-5" />}
          Rejeter
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {typed === null ? (
          <button type="button" onClick={() => setTyped("")} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
            <Keyboard className="size-3.5" /> Écrire la correction
          </button>
        ) : null}
        {canUndo || result?.changes.length ? (
          <button type="button" onClick={() => void handleUndo()} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
            <Undo2 className="size-3.5" /> Annuler la dernière correction
          </button>
        ) : null}
        <Link href={`/app/quotes/new?voiceIntakeId=${intakeId}&aiDraft=1`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
          <Pencil className="size-3.5" /> Modifier à la main
        </Link>
      </div>
    </div>
  );
}

/** Ranger (onglet Devis) ou sortir des archives. */
export function VoiceIntakeArchiveButton({ intakeId, mode }: { intakeId: string; mode: "archive" | "restore" }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    setPending(true);
    const res = mode === "archive" ? await archiveVoiceIntake(intakeId) : await restoreVoiceIntake(intakeId);
    setPending(false);
    if (!res.ok) {
      toast.error(mode === "archive" ? "Impossible d'archiver cet appel." : "Impossible de restaurer cet appel.");
      return;
    }
    toast.message(mode === "archive" ? "Appel archivé." : "Appel restauré.");
    router.refresh();
  }

  const Icon = mode === "archive" ? Archive : ArchiveRestore;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground"
      disabled={pending}
      onClick={() => void handleClick()}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {mode === "archive" ? "Archiver" : "Restaurer"}
    </Button>
  );
}
