import { AppPageHeader } from "@/components/app/app-page-header";
import { formatPhoneFr } from "@/lib/phone";
import { getCurrentReferrer } from "@/lib/referrers/current";

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[180px_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || "—"}</dd>
    </div>
  );
}

export default async function ReferrerDashboardPage() {
  const r = await getCurrentReferrer();
  if (!r) return null; // garde du layout

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Apport d’affaires"
        title={`Bonjour ${r.first_name}`}
        description="Ton espace est créé. Les demandes, l’envoi des lots aux artisans de ton réseau et le suivi de tes commissions arrivent dans la prochaine version."
      />

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="font-display text-base font-semibold">Ton entreprise</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Ces informations figureront sur tes factures de commission. Pour les modifier, contacte l’équipe Soline.
        </p>
        <dl className="mt-4 space-y-2.5">
          <Row label="Dénomination" value={r.business_name} />
          <Row label="Contact" value={`${r.first_name} ${r.last_name} · ${formatPhoneFr(r.phone)} · ${r.email}`} />
          <Row label="SIREN / SIRET" value={[r.siren, r.siret].filter(Boolean).join(" / ")} />
          <Row label="Adresse" value={[r.address_line1, r.address_line2, `${r.postal_code} ${r.city}`].filter(Boolean).join(", ")} />
          <Row
            label="TVA"
            value={r.vat_regime === "franchise" ? "Franchise en base (art. 293 B du CGI)" : `Assujetti — ${r.vat_number}`}
          />
        </dl>
      </section>
    </div>
  );
}
