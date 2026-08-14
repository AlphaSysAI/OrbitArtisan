"use client";

import { FormEvent, useState } from "react";
import { Phone } from "lucide-react";

import { setArtisanVoiceNumber } from "@/features/voice/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface VoiceNumberFormProps {
  initialPhone?: string | null;
}

export function VoiceNumberForm({ initialPhone }: VoiceNumberFormProps) {
  const [phone, setPhone] = useState(initialPhone || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const result = await setArtisanVoiceNumber(phone);
      if (result.success) {
        setMessage({ type: "success", text: "Numéro vocal configuré avec succès !" });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Erreur serveur" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {message ? (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          <p>{message.text}</p>
        </Alert>
      ) : null}

      <div className="space-y-3">
        <Label htmlFor="voice-phone" className="text-base">
          Numéro de téléphone (format E.164)
        </Label>
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="voice-phone"
            type="tel"
            placeholder="+33612345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading}
            className="h-12 pl-10 font-mono text-base"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Format international requis (ex. +33 pour France). Laisse vide pour désactiver l’IA vocale.
        </p>
      </div>

      <Button type="submit" size="lg" disabled={loading} className="w-full sm:w-auto">
        {loading ? "Enregistrement..." : "Enregistrer le numéro vocal"}
      </Button>

      <div className="rounded-2xl border border-border/70 bg-muted/40 p-5">
        <p className="font-display text-lg font-semibold tracking-tight">Comment ça marche ?</p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>Les clients appellent ton numéro vocal</li>
          <li>L’IA parle français et peut prendre des RDV</li>
          <li>Tu reçois les demandes dans « Rendez-vous »</li>
          <li>Tu confirmes ou annules depuis ton espace</li>
        </ul>
      </div>
    </form>
  );
}
