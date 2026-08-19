import Link from "next/link";
import { notFound } from "next/navigation";

import { TenantActions, TenantStatusBadges } from "@/components/admin/tenant-actions";
import { updateTenantPlanForm, updateTenantProfileForm } from "@/app/admin/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminTenant } from "@/lib/admin/tenants";
import { formatPriceHtEur, SUBSCRIPTION_PLANS } from "@/lib/billing/subscription-plans";

export default async function AdminTenantDetailPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const tenant = await getAdminTenant(profileId);
  if (!tenant) notFound();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/tenants" className={buttonVariants({ variant: "outline", size: "sm" })}>
            ← Artisans
          </Link>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">{tenant.businessName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tenant.email}</p>
          <div className="mt-3">
            <TenantStatusBadges tenant={tenant} />
          </div>
        </div>
        <TenantActions tenant={tenant} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Coordonnées entreprise</CardTitle>
            <CardDescription>Modification directe par Super Admin.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateTenantProfileForm.bind(null, profileId)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="business_name">Raison sociale</Label>
                <Input id="business_name" name="business_name" defaultValue={tenant.businessName} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nom du contact</Label>
                <Input id="name" name="name" defaultValue={tenant.name ?? ""} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="siren">SIREN</Label>
                  <Input id="siren" name="siren" defaultValue={tenant.siren ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="siret">SIRET</Label>
                  <Input id="siret" name="siret" defaultValue={tenant.siret ?? ""} />
                </div>
              </div>
              <Button type="submit">Enregistrer</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Abonnement & accès</CardTitle>
            <CardDescription>Forfait et statut de paiement (manuel jusqu&apos;à Stripe Billing).</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateTenantPlanForm.bind(null, profileId)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subscription_plan">Formule</Label>
                <select
                  id="subscription_plan"
                  name="subscription_plan"
                  defaultValue={tenant.subscriptionPlan}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {SUBSCRIPTION_PLANS.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — {formatPriceHtEur(plan.priceMonthlyHtEur)} € HT/mois
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subscription_status">Statut paiement</Label>
                <select
                  id="subscription_status"
                  name="subscription_status"
                  defaultValue={tenant.subscriptionStatus}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="active">Actif</option>
                  <option value="trialing">Essai</option>
                  <option value="past_due">Impayé</option>
                  <option value="canceled">Résilié</option>
                </select>
              </div>
              <Button type="submit">Mettre à jour le plan</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activité</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-muted-foreground">Devis</p>
            <p className="text-2xl font-semibold tabular-nums">{tenant.quotesCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Factures</p>
            <p className="text-2xl font-semibold tabular-nums">{tenant.invoicesCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Inscription</p>
            <p className="font-medium">{new Date(tenant.createdAt).toLocaleString("fr-FR")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
