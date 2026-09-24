import Link from "next/link";

import { TelecomLookupForm } from "@/components/admin/telecom-lookup-form";
import { AppPageHeader } from "@/components/app/app-page-header";
import { buttonVariants } from "@/components/ui/button-variants";

export default async function AdminTelecomPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const phone = typeof sp.phone === "string" ? sp.phone : "";
  const at = typeof sp.at === "string" ? sp.at : "";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <AppPageHeader
          eyebrow="Conformité télécom"
          title="Registre des numéros vocaux"
          description="Identifie quel artisan exploitait un numéro à un instant donné (réquisitions police / gendarmerie)."
        />
        <Link href="/admin/telecom/pool" className={buttonVariants({ variant: "outline" })}>
          Pool numéros
        </Link>
      </div>
      <TelecomLookupForm initialPhone={phone} initialInstant={at} />
    </div>
  );
}
