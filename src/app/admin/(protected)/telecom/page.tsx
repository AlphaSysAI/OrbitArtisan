import { TelecomLookupForm } from "@/components/admin/telecom-lookup-form";
import { AppPageHeader } from "@/components/app/app-page-header";
import { TelecomTabs } from "@/components/admin/telecom-tabs";

export default async function AdminTelecomPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const phone = typeof sp.phone === "string" ? sp.phone : "";
  const at = typeof sp.at === "string" ? sp.at : "";

  return (
    <div className="space-y-5">
      <AppPageHeader
        eyebrow="Numéros Soline"
        title="Registre des numéros"
        description="Quel artisan exploitait un numéro à un instant donné (réquisitions police / gendarmerie)."
      />
      <TelecomTabs current="registre" />
      <TelecomLookupForm initialPhone={phone} initialInstant={at} />
    </div>
  );
}
