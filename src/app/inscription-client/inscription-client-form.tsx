"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { finalizePendingVitrineAppointment } from "@/app/site/[slug]/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function translateAuthError(message: string, code?: string): string {
  const m = message.toLowerCase();
  if (
    code === "user_already_exists" ||
    m.includes("already registered") ||
    m.includes("user already")
  ) {
    return "Cet email est déjà utilisé. Connecte-toi ou choisis un autre email.";
  }
  if (m.includes("password") && (m.includes("at least") || m.includes("least") || m.includes("weak"))) {
    return "Mot de passe trop court ou trop faible (selon les règles du compte).";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "Adresse email invalide.";
  }
  if (m.includes("signup") && m.includes("disabled")) {
    return "Les inscriptions par email sont désactivées sur ce projet (réglages Supabase).";
  }
  return message;
}

export function InscriptionClientForm({
  next,
  pendingAppointmentId,
  prefillEmail,
}: {
  next: string;
  pendingAppointmentId?: string | null;
  prefillEmail?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCheckEmail(false);
    setLoading(true);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const displayName = String(fd.get("display_name") ?? "").trim();

    if (!email || !password) {
      setError("Email et mot de passe sont obligatoires.");
      setLoading(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const origin = window.location.origin;
    const callbackNext = pendingAppointmentId ? `/compte?pending=${pendingAppointmentId}` : next;
    const { data, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(callbackNext)}`,
      },
    });

    if (signErr) {
      setError(translateAuthError(signErr.message, signErr.code));
      setLoading(false);
      return;
    }

    if (data.session && data.user) {
      const name = displayName || email.split("@")[0] || "Client";
      const { error: profileErr } = await supabase.from("customer_profiles").upsert(
        { user_id: data.user.id, display_name: name, email },
        { onConflict: "user_id" },
      );
      if (profileErr) {
        setError(
          "Compte créé, mais l’enregistrement du profil client a échoué. Vérifie que le script SQL `supabase/messages.sql` a bien été appliqué.",
        );
        setLoading(false);
        return;
      }
      if (pendingAppointmentId) {
        const fin = await finalizePendingVitrineAppointment(pendingAppointmentId);
        if (!fin.ok) {
          setError(
            fin.error === "email_mismatch"
              ? "L’email du compte doit être le même que celui utilisé pour la demande de RDV."
              : "Compte créé, mais la finalisation du rendez-vous a échoué. Tu peux reprendre contact avec l’artisan.",
          );
          setLoading(false);
          return;
        }
        router.push("/compte?success=rdv");
      } else {
        router.push(next);
      }
      router.refresh();
      return;
    }

    if (data.user) {
      setCheckEmail(true);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Inscription impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {checkEmail && (
        <Alert>
          <AlertTitle>Vérifie tes emails</AlertTitle>
          <AlertDescription>
            Confirme ton compte si demandé, puis reviens sur la page de l’artisan.
          </AlertDescription>
        </Alert>
      )}

      {pendingAppointmentId && (
        <Alert>
          <AlertTitle>Demande de RDV en attente</AlertTitle>
          <AlertDescription>
            Utilise la même adresse email que celle indiquée sur la demande pour finaliser le rendez-vous après
            inscription.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display_name">Comment vous appeler</Label>
          <Input id="display_name" name="display_name" placeholder="Camille" autoComplete="nickname" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={prefillEmail ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Création…" : "Créer mon compte client"}
        </Button>
      </form>
    </div>
  );
}
