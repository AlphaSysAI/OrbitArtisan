import { AppPageHeader } from "@/components/app/app-page-header";
import {
  InvitationRowActions,
  InviteReferrerForm,
  ReferrerStatusButton,
} from "@/components/admin/referrers/referrer-admin-actions";
import { Badge } from "@/components/ui/badge";
import { getAdminDb } from "@/lib/admin/db";
import { formatDateFr, formatDateTimeFr } from "@/lib/format/date";
import { formatPhoneFr } from "@/lib/phone";
import { invitationState, type InvitationRow, type InvitationState } from "@/lib/referrers/invitations";

type ReferrerRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  business_name: string;
  siren: string;
  city: string;
  vat_regime: string;
  status: "active" | "suspended";
  created_at: string;
};

const STATE_LABEL: Record<InvitationState, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "En attente", variant: "secondary" },
  expired: { label: "Expirée", variant: "destructive" },
  claimed: { label: "Utilisée", variant: "outline" },
  cancelled: { label: "Annulée", variant: "outline" },
};

export default async function AdminReferrersPage() {
  const db = getAdminDb();
  const [{ data: referrers }, { data: invitations }] = db
    ? await Promise.all([
        db
          .from("business_referrers")
          .select("id, first_name, last_name, email, phone, business_name, siren, city, vat_regime, status, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
        db
          .from("business_referrer_invitations")
          .select("id, email, first_name, last_name, siren, created_at, expires_at, sent_at, send_count, claimed_at, cancelled_at")
          .is("claimed_at", null)
          .is("cancelled_at", null)
          .order("created_at", { ascending: false })
          .limit(200),
      ])
    : [{ data: [] }, { data: [] }];

  const pending = (invitations ?? []) as InvitationRow[];
  const active = (referrers ?? []) as ReferrerRow[];

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Apport d’affaires"
        title="Apporteurs"
        description="Seul l’admin crée un accès apporteur : e-mail, nom, prénom et SIREN. L’apporteur reçoit un lien personnel (14 jours) pour compléter son entreprise et choisir son mot de passe."
      />

      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 font-display text-base font-semibold">Nouvel apporteur</h2>
        <InviteReferrerForm />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold">Invitations en cours ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">Aucune invitation en cours.</p>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card">
            {pending.map((inv) => {
              const state = STATE_LABEL[invitationState(inv)];
              return (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {inv.first_name} {inv.last_name} <span className="text-muted-foreground">· SIREN {inv.siren}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {inv.email} · {inv.sent_at ? `envoyée le ${formatDateTimeFr(inv.sent_at)}` : "e-mail non envoyé"} · expire le{" "}
                      {formatDateFr(inv.expires_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={state.variant}>{state.label}</Badge>
                    <InvitationRowActions invitationId={inv.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold">Apporteurs actifs ({active.length})</h2>
        {active.length === 0 ? (
          <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">Aucun apporteur pour l’instant.</p>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card">
            {active.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.business_name} <span className="text-muted-foreground">· {r.first_name} {r.last_name}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.email} · {formatPhoneFr(r.phone)} · {r.city} · SIREN {r.siren} ·{" "}
                    {r.vat_regime === "franchise" ? "franchise TVA" : "assujetti TVA"} · depuis le {formatDateFr(r.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.status === "suspended" ? <Badge variant="destructive">Suspendu</Badge> : null}
                  <ReferrerStatusButton referrerId={r.id} status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
