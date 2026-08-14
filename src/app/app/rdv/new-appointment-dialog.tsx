"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { createArtisanAppointment } from "./actions";

export type AppointmentContactOption = {
  label: string;
  email: string | null;
};

export type NewAppointmentPrefill = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** "YYYY-MM-DDTHH:mm" */
  start?: string | null;
  serviceId?: string | null;
  /** Prérempli par l’assistant IA */
  fromAssistant?: boolean;
};

const SELECT_CLASS =
  "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewAppointmentDialog({
  contacts,
  services,
  prefill,
  openOnMount = false,
}: {
  contacts: AppointmentContactOption[];
  services: { id: string; title: string }[];
  prefill?: NewAppointmentPrefill;
  openOnMount?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(openOnMount);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState(prefill?.name ?? "");
  const [email, setEmail] = React.useState(prefill?.email ?? "");
  const [phone, setPhone] = React.useState(prefill?.phone ?? "");
  const [start, setStart] = React.useState(prefill?.start || defaultStart());
  const [serviceId, setServiceId] = React.useState(prefill?.serviceId ?? "");
  const [status, setStatus] = React.useState<"confirmed" | "pending">("confirmed");

  const missingEmail = prefill?.fromAssistant && !prefill.email;

  function pickContact(value: string) {
    if (!value) return;
    const contact = contacts.find((c) => `${c.label}|${c.email ?? ""}` === value);
    if (!contact) return;
    setName(contact.label);
    if (contact.email) setEmail(contact.email);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) {
      setError("Date ou heure invalide.");
      return;
    }

    setLoading(true);
    const res = await createArtisanAppointment({
      customerName: name,
      customerEmail: email,
      customerPhone: phone || null,
      startIso: startDate.toISOString(),
      dateIso: start.slice(0, 10),
      serviceId: serviceId || null,
      status,
    });
    setLoading(false);

    if (!res.ok) {
      const messages: Record<string, string> = {
        invalid_name: "Indique le nom du client.",
        invalid_email: "Adresse e-mail invalide.",
        invalid_date: "Date ou heure invalide.",
        rls_denied:
          "Base de données non autorisée : exécute supabase/init.sql (ou renseigne SUPABASE_SERVICE_ROLE_KEY).",
        auth: "Session expirée, reconnecte-toi.",
        missing_profile: "Profil artisan introuvable.",
      };
      setError(messages[res.error] ?? "Création impossible. Réessaie.");
      return;
    }

    toast.success("Rendez-vous créé");
    setOpen(false);
    router.replace(`/app/rdv?date=${res.dateIso}`);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          // Évite de rouvrir le formulaire au prochain rafraîchissement.
          if (openOnMount) router.replace("/app/rdv");
        }
      }}
    >
      <Button type="button" size="lg" className="gap-2" onClick={() => setOpen(true)}>
        <CalendarPlus className="size-4" />
        Nouveau rendez-vous
      </Button>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau rendez-vous</DialogTitle>
          <DialogDescription>
            Vérifie les informations, puis enregistre. Le client n’est pas prévenu automatiquement.
          </DialogDescription>
        </DialogHeader>

        {prefill?.fromAssistant ? (
          <Alert>
            <Sparkles className="size-4" />
            <AlertTitle>Prérempli par Orbit IA</AlertTitle>
            <AlertDescription>
              {missingEmail
                ? "Je n’ai pas retrouvé ce client dans tes contacts : complète son e-mail avant d’enregistrer."
                : "Contrôle la date, l’heure et le client avant d’enregistrer."}
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          {contacts.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="rdv_contact">Client existant</Label>
              <select
                id="rdv_contact"
                className={SELECT_CLASS}
                defaultValue=""
                onChange={(e) => pickContact(e.target.value)}
              >
                <option value="">— Choisir dans mes contacts —</option>
                {contacts.map((c) => (
                  <option key={`${c.label}|${c.email ?? ""}`} value={`${c.label}|${c.email ?? ""}`}>
                    {c.label}
                    {c.email ? ` (${c.email})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rdv_name">Nom du client</Label>
              <Input
                id="rdv_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Florian Lapertot"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rdv_email">E-mail</Label>
              <Input
                id="rdv_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="client@exemple.fr"
                className={cn(missingEmail && !email && "border-warning")}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rdv_start">Date et heure</Label>
              <Input
                id="rdv_start"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rdv_phone">Téléphone (optionnel)</Label>
              <Input
                id="rdv_phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="06 12 34 56 78"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rdv_service">Prestation (optionnel)</Label>
              <select
                id="rdv_service"
                className={SELECT_CLASS}
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
              >
                <option value="">— Aucune —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rdv_status">Statut</Label>
              <select
                id="rdv_status"
                className={SELECT_CLASS}
                value={status}
                onChange={(e) => setStatus(e.target.value === "pending" ? "pending" : "confirmed")}
              >
                <option value="confirmed">Confirmé</option>
                <option value="pending">En attente</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
              Créer le rendez-vous
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
