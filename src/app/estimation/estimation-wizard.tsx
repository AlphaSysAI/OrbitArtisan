"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BadgeEuro,
  Loader2,
  MapPin,
  RefreshCcw,
  Send,
  Store,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button-variants";
import { StepShell, TradePicker, type TradeSelection } from "@/components/trades/trade-picker";
import { LeadSentPanel } from "@/components/leads/lead-sent-panel";
import type { LeadChatMessage } from "@/lib/leads/chat-schema";
import type { LeadSignupOffer } from "@/lib/leads/client-signup-types";
import { buildLeadSuiviHref } from "@/lib/leads/client-signup-urls";
import type { LeadEstimate, LeadSession, MatchedArtisan } from "@/lib/leads/types";
import { cn } from "@/lib/utils";

import {
  finalizeLead,
  finalizeWidgetLead,
  saveLeadBrief,
  startLead,
  submitLeadContact,
} from "./actions";
import { ChatStep } from "./chat-step";
import { LocationStep, type LeadLocation } from "./location-step";
import { MediaStep } from "./media-step";

const STEP_LABELS_GENERAL = ["Métier", "Besoin", "Photos", "Adresse", "Estimation"];
const STEP_LABELS_WIDGET = ["Besoin", "Photos", "Estimation"];

type WidgetOwner = { slug: string; businessName: string };

type WizardState = {
  session: LeadSession | null;
  trade: TradeSelection | null;
  description: string;
  /** Conversation de qualification, réutilisée par l'analyse IA du besoin. */
  messages: LeadChatMessage[];
  mediaCount: number;
  location: LeadLocation | null;
  matchedArtisans: MatchedArtisan[];
};

type Screen =
  | { name: "trade" }
  | { name: "creating" }
  | { name: "chat" }
  | { name: "media" }
  | { name: "location" }
  | { name: "result" }
  | { name: "contact" }
  | { name: "sent"; leadToken: string; signup?: LeadSignupOffer; warning?: "no_artisans" | "dispatch_pending" };

const euros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function EstimationWizard({
  originArtisanSlug,
  presetTrade = null,
  owner = null,
  compact = false,
}: {
  originArtisanSlug: string | null;
  /** Métier déjà connu (widget d'un artisan) : l'étape 1 est sautée. */
  presetTrade?: TradeSelection | null;
  /** Artisan propriétaire du widget, mis en avant dans les résultats. */
  owner?: WidgetOwner | null;
  compact?: boolean;
}) {
  const [screen, setScreen] = React.useState<Screen>(
    presetTrade ? { name: "creating" } : { name: "trade" },
  );
  const [state, setState] = React.useState<WizardState>({
    session: null,
    trade: presetTrade,
    description: "",
    messages: [],
    mediaCount: 0,
    location: null,
    matchedArtisans: [],
  });

  const directToOwner = !!owner;

  const openLead = React.useCallback(
    async (trade: TradeSelection) => {
      setScreen({ name: "creating" });
      const res = await startLead({
        categoryId: trade.categoryId,
        tradeId: trade.tradeId,
        originArtisanSlug,
      });
      if (!res.ok) {
        toast.error("Impossible de démarrer la demande. Réessaie dans un instant.");
        setScreen({ name: "trade" });
        return;
      }
      setState((s) => ({ ...s, session: res.session, trade }));
      setScreen({ name: "chat" });
    },
    [originArtisanSlug],
  );

  // Métier déjà connu : le lead démarre sans attendre une saisie.
  const bootstrappedRef = React.useRef(false);
  React.useEffect(() => {
    if (!presetTrade || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void openLead(presetTrade);
  }, [presetTrade, openLead]);

  async function onTradeSelected(trade: TradeSelection) {
    // Correction de métier en cours de route : on garde le même lead.
    if (state.session) {
      setState((s) => ({ ...s, trade }));
      setScreen({ name: "chat" });
      const res = await saveLeadBrief({
        token: state.session.token,
        categoryId: trade.categoryId,
        tradeId: trade.tradeId,
      });
      if (!res.ok) console.error("[estimation] trade", res.error);
      return;
    }
    await openLead(trade);
  }

  async function onDescriptionDone(description: string, messages: LeadChatMessage[]) {
    if (!state.session) return;
    setState((s) => ({ ...s, description, messages }));
    setScreen({ name: "media" });
    // Sauvegarde silencieuse : une écriture ratée ne doit pas bloquer le parcours.
    const res = await saveLeadBrief({ token: state.session.token, description });
    if (!res.ok) console.error("[estimation] brief", res.error);
  }

  async function onLocationDone(location: LeadLocation) {
    if (!state.session) return;
    setState((s) => ({ ...s, location }));
    const res = await saveLeadBrief({
      token: state.session.token,
      lat: location.lat,
      lng: location.lng,
      addressLabel: location.label,
    });
    if (!res.ok) {
      toast.error("L’adresse n’a pas pu être enregistrée.");
      return;
    }
    setScreen({ name: "result" });
  }

  const labels = directToOwner
    ? presetTrade
      ? STEP_LABELS_WIDGET
      : ["Métier", ...STEP_LABELS_WIDGET]
    : presetTrade
      ? STEP_LABELS_GENERAL.slice(1)
      : STEP_LABELS_GENERAL;

  const rawIndex = directToOwner
    ? screen.name === "trade" || screen.name === "creating"
      ? 0
      : screen.name === "chat"
        ? presetTrade
          ? 0
          : 1
        : screen.name === "media"
          ? presetTrade
            ? 1
            : 2
          : screen.name === "result" || screen.name === "contact" || screen.name === "sent"
            ? presetTrade
              ? 2
              : 3
            : 0
    : screen.name === "trade" || screen.name === "creating"
      ? 0
      : screen.name === "chat"
        ? 1
        : screen.name === "media"
          ? 2
          : screen.name === "location"
            ? 3
            : 4;

  const stepIndex = directToOwner
    ? rawIndex
    : presetTrade
      ? Math.max(0, rawIndex - 1)
      : rawIndex;

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <Stepper labels={labels} current={stepIndex} compact={compact} />

      {screen.name === "trade" && (
        <TradePicker
          subtitle={owner ? `Demande adressée à ${owner.businessName}` : "Estimation gratuite, sans inscription"}
          onSelect={onTradeSelected}
        />
      )}

      {screen.name === "creating" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">On prépare tes questions…</p>
        </div>
      )}

      {screen.name === "chat" && state.trade && (
        <ChatStep
          key={state.trade.tradeId}
          tradeLabel={state.trade.tradeLabel}
          onBack={() => setScreen({ name: "trade" })}
          onDone={(description, messages) => void onDescriptionDone(description, messages)}
        />
      )}

      {screen.name === "media" && state.session && (
        <MediaStep
          token={state.session.token}
          onBack={() => setScreen({ name: "chat" })}
          onDone={(count) => {
            setState((s) => ({ ...s, mediaCount: count }));
            setScreen(directToOwner ? { name: "result" } : { name: "location" });
          }}
        />
      )}

      {!directToOwner && screen.name === "location" && (
        <LocationStep
          onBack={() => setScreen({ name: "media" })}
          onDone={(location) => void onLocationDone(location)}
        />
      )}

      {screen.name === "result" && state.session && state.trade && directToOwner && owner && (
        <WidgetResultStep
          token={state.session.token}
          categoryId={state.trade.categoryId}
          tradeId={state.trade.tradeId}
          tradeLabel={state.trade.tradeLabel}
          description={state.description}
          messages={state.messages}
          mediaCount={state.mediaCount}
          owner={owner}
          onBack={() => setScreen({ name: "media" })}
          onAccept={(artisans) => {
            setState((s) => ({ ...s, matchedArtisans: artisans }));
            setScreen({ name: "contact" });
          }}
        />
      )}

      {screen.name === "result" && state.session && state.trade && !directToOwner && (
        <ResultStep
          token={state.session.token}
          categoryId={state.trade.categoryId}
          tradeId={state.trade.tradeId}
          tradeLabel={state.trade.tradeLabel}
          description={state.description}
          messages={state.messages}
          mediaCount={state.mediaCount}
          locationLabel={state.location?.label ?? ""}
          ownerSlug={originArtisanSlug}
          onBack={() => setScreen({ name: "location" })}
          onAccept={(artisans) => {
            setState((s) => ({ ...s, matchedArtisans: artisans }));
            setScreen({ name: "contact" });
          }}
        />
      )}

      {screen.name === "contact" && state.session && (
        <ContactStep
          token={state.session.token}
          mode={directToOwner ? "widget" : "general"}
          ownerName={owner?.businessName ?? null}
          onBack={() => setScreen({ name: "result" })}
          onSent={(payload) =>
            setScreen({
              name: "sent",
              leadToken: state.session!.token,
              signup: payload.signup,
              warning: payload.warning,
            })
          }
        />
      )}

      {screen.name === "sent" && (
        <div className="space-y-4">
          <LeadSentPanel
            leadToken={screen.leadToken}
            signup={screen.signup}
            warning={screen.warning}
            compact={compact}
            directToOwner={directToOwner}
            ownerName={owner?.businessName ?? null}
            artisans={state.matchedArtisans}
          />
          {screen.signup?.canSignup ? (
            <p className="text-center text-xs text-muted-foreground">
              Tu pourras retrouver cette page plus tard :{" "}
              <a
                href={buildLeadSuiviHref(screen.leadToken)}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                lien de suivi
              </a>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Stepper({
  labels,
  current,
  compact,
}: {
  labels: string[];
  current: number;
  compact: boolean;
}) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progression">
      {labels.map((label, i) => (
        <li key={label} className="flex flex-1 flex-col gap-1.5">
          <span
            className={cn(
              "h-1.5 rounded-full transition-colors",
              i <= current ? "bg-primary" : "bg-border",
            )}
          />
          <span
            className={cn(
              "text-[11px]",
              compact ? "hidden" : "hidden sm:block",
              i === current ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function WidgetResultStep({
  token,
  categoryId,
  tradeId,
  tradeLabel,
  description,
  messages,
  mediaCount,
  owner,
  onBack,
  onAccept,
}: {
  token: string;
  categoryId: string;
  tradeId: string;
  tradeLabel: string;
  description: string;
  messages: LeadChatMessage[];
  mediaCount: number;
  owner: WidgetOwner;
  onBack: () => void;
  onAccept: (artisans: MatchedArtisan[]) => void;
}) {
  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "done"; estimate: LeadEstimate; artisan: MatchedArtisan | null }
  >({ status: "loading" });

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    const res = await finalizeWidgetLead({
      token,
      categoryId,
      tradeId,
      description,
      messages,
      mediaCount,
    });
    if (!res.ok) {
      setState({ status: "error" });
      return;
    }
    setState({ status: "done", estimate: res.estimate, artisan: res.artisan });
  }, [token, categoryId, tradeId, description, messages, mediaCount]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card py-20 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">On chiffre ta demande…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <StepShell title="Estimation indisponible" onBack={onBack}>
        <p className="text-sm text-muted-foreground">
          {owner.businessName} ne reçoit pas les demandes pour le moment, ou le calcul a échoué.
          Réessaie dans un instant.
        </p>
        <Button type="button" variant="outline" className="gap-2" onClick={() => void load()}>
          <RefreshCcw className="h-4 w-4" />
          Réessayer
        </Button>
      </StepShell>
    );
  }

  const artisan = state.artisan;

  return (
    <StepShell title="Ton estimation" subtitle={`${tradeLabel} · ${owner.businessName}`} onBack={onBack}>
      <div className="rounded-2xl border bg-card p-6">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <BadgeEuro className="h-4 w-4" />
          Fourchette indicative
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">
          {euros.format(state.estimate.min)} – {euros.format(state.estimate.max)}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">{state.estimate.basis}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Estimation indicative basée sur les tarifs de {owner.businessName} — seule la proposition
          validée par l’artisan, après visite ou échange, fait foi.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-sm font-medium">Envoi direct dans la messagerie</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ta demande sera transmise à <strong>{owner.businessName}</strong>
          {artisan ? " qui pourra te recontacter par téléphone." : "."}
        </p>
      </div>

      <Button
        type="button"
        size="lg"
        className="w-full gap-2"
        onClick={() => onAccept(artisan ? [artisan] : [])}
        disabled={!artisan}
      >
        <Send className="h-4 w-4" />
        Envoyer ma demande à {owner.businessName}
      </Button>
    </StepShell>
  );
}

function ResultStep({
  token,
  categoryId,
  tradeId,
  tradeLabel,
  description,
  messages,
  mediaCount,
  locationLabel,
  ownerSlug,
  onBack,
  onAccept,
}: {
  token: string;
  categoryId: string;
  tradeId: string;
  tradeLabel: string;
  description: string;
  messages: LeadChatMessage[];
  mediaCount: number;
  locationLabel: string;
  ownerSlug: string | null;
  onBack: () => void;
  onAccept: (artisans: MatchedArtisan[]) => void;
}) {
  const [state, setState] = React.useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "done"; estimate: LeadEstimate; artisans: MatchedArtisan[] }
  >({ status: "loading" });

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    const res = await finalizeLead({
      token,
      categoryId,
      tradeId,
      description,
      messages,
      mediaCount,
    });
    if (!res.ok) {
      setState({ status: "error" });
      return;
    }
    setState({ status: "done", estimate: res.estimate, artisans: res.artisans });
  }, [token, categoryId, tradeId, description, messages, mediaCount]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card py-20 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">On chiffre ta demande…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <StepShell title="Estimation indisponible" onBack={onBack}>
        <p className="text-sm text-muted-foreground">
          Le calcul n’a pas abouti. Réessaie, tes réponses sont conservées.
        </p>
        <Button type="button" variant="outline" className="gap-2" onClick={() => void load()}>
          <RefreshCcw className="h-4 w-4" />
          Réessayer
        </Button>
      </StepShell>
    );
  }

  return (
    <StepShell title="Ton estimation" subtitle={`${tradeLabel} · ${locationLabel}`} onBack={onBack}>
      <div className="rounded-2xl border bg-card p-6">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <BadgeEuro className="h-4 w-4" />
          Fourchette indicative
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">
          {euros.format(state.estimate.min)} – {euros.format(state.estimate.max)}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">{state.estimate.basis}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Estimation indicative, non engageante — seule la proposition validée par l’artisan, après
          visite ou échange, fait foi.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">
          {ownerSlug && state.artisans.some((a) => a.slug === ownerSlug)
            ? state.artisans.length > 1
              ? `Ta demande part à ton artisan et ${state.artisans.length - 1} confrère${state.artisans.length > 2 ? "s" : ""} disponible${state.artisans.length > 2 ? "s" : ""}`
              : "Ta demande part à ton artisan"
            : state.artisans.length > 0
              ? `${state.artisans.length} artisan${state.artisans.length > 1 ? "s" : ""} disponible${state.artisans.length > 1 ? "s" : ""} près de toi`
              : "Artisans à proximité"}
        </h3>

        {state.artisans.length === 0 && (
          <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
            Aucun artisan de ce métier n’est encore inscrit dans ta zone. Laisse tes coordonnées : on te
            prévient dès qu’un professionnel peut prendre ta demande.
          </p>
        )}

        <ul className="space-y-3">
          {state.artisans.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-base font-semibold">
                {a.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- logos hébergés hors domaines configurés
                  <img src={a.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  a.businessName.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="truncate font-medium">{a.businessName}</span>
                  {a.slug === ownerSlug && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Ton artisan
                    </span>
                  )}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {a.city ?? "—"}
                  {a.distanceKm != null && <span className="text-foreground">· à {a.distanceKm} km</span>}
                </p>
              </div>
              <Link
                href={`/site/${a.slug}`}
                target="_blank"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0 gap-1.5")}
              >
                <Store className="h-4 w-4" />
                Vitrine
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <Button
        type="button"
        size="lg"
        className="w-full gap-2"
        onClick={() => onAccept(state.artisans)}
      >
        <Send className="h-4 w-4" />
        Envoyer ma demande
      </Button>
    </StepShell>
  );
}

function ContactStep({
  token,
  mode,
  ownerName,
  onBack,
  onSent,
}: {
  token: string;
  mode: "widget" | "general";
  ownerName: string | null;
  onBack: () => void;
  onSent: (payload: { signup?: LeadSignupOffer; warning?: "no_artisans" | "dispatch_pending" }) => void;
}) {
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const res = await submitLeadContact({
      token,
      firstName,
      lastName,
      email: mode === "general" ? email : null,
      phone,
      mode,
    });
    setPending(false);

    if (!res.ok) {
      setError(
        res.error === "invalid_phone"
          ? "Indique un numéro de téléphone valide."
          : res.error === "invalid_email"
            ? "Cet e-mail ne semble pas valide."
            : res.error === "invalid_first_name"
              ? "Indique ton prénom."
              : res.error === "invalid_last_name"
                ? "Indique ton nom."
                : "L’envoi a échoué. Réessaie dans un instant.",
      );
      return;
    }
    onSent({ signup: res.signup, warning: res.warning });
  }

  return (
    <StepShell
      title="Comment te recontacter ?"
      subtitle={
        mode === "widget" && ownerName
          ? `${ownerName} te recontactera par téléphone`
          : "Dernière étape — aucun compte à créer"
      }
      onBack={onBack}
    >
      <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="lead_first_name">Prénom</Label>
            <Input
              id="lead_first_name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Camille"
              autoComplete="given-name"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead_last_name">Nom</Label>
            <Input
              id="lead_last_name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Martin"
              autoComplete="family-name"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="lead_phone">Téléphone</Label>
          <Input
            id="lead_phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="06 12 34 56 78"
            autoComplete="tel"
            inputMode="tel"
            required
          />
        </div>

        {mode === "general" ? (
          <div className="space-y-2">
            <Label htmlFor="lead_email">E-mail (optionnel)</Label>
            <Input
              id="lead_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="camille@exemple.fr"
              autoComplete="email"
              inputMode="email"
            />
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {mode === "widget"
            ? "Ton numéro permet à l’artisan de te rappeler. Estimation indicative, non engageante."
            : "Les artisans sélectionnés te recontactent par téléphone. L’e-mail sert uniquement au suivi en ligne, s’il est renseigné."}
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" size="lg" className="w-full gap-2" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Envoyer ma demande
        </Button>
      </form>
    </StepShell>
  );
}
