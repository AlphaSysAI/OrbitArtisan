import { redirect } from "next/navigation";

export default async function AbonnementPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; success?: string; canceled?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams({ tab: "abonnement" });
  if (sp.reason) params.set("reason", sp.reason);
  if (sp.success) params.set("success", sp.success);
  if (sp.canceled) params.set("canceled", sp.canceled);

  redirect(`/app/reglages?${params.toString()}`);
}
