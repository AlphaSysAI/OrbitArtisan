"use client";

import { FormEvent, useState } from "react";
import { setArtisanVoiceNumber, getArtisanVoiceNumber } from "@/features/voice/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";

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
    <form onSubmit={handleSubmit} className="space-y-6">
      {message ? (
        <Alert variant={message.type}>
          <p>{message.text}</p>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="voice-phone">Numéro de téléphone (format E.164)</Label>
        <Input
          id="voice-phone"
          type="tel"
          placeholder="+33612345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={loading}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Format international requis (ex. +33 pour France). Laisse vide pour désactiver l'IA vocale.
        </p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Enregistrement..." : "Enregistrer le numéro vocal"}
      </Button>

      <div className="space-y-3 rounded-lg bg-blue-50 p-4 text-sm text-blue-950 dark:bg-blue-950/20 dark:text-blue-50">
        <p className="font-medium">💬 Comment ça marche ?</p>
        <ul className="list-inside list-disc space-y-1 pl-2">
          <li>Les clients appellent ton numéro vocal</li>
          <li>L'IA parle français et peut prendre des RDV</li>
          <li>Tu reçois les demandes dans « Rendez-vous »</li>
          <li>Tu confirmes ou annules depuis ton espace</li>
        </ul>
      </div>
    </form>
  );
}
