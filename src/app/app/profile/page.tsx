import { redirect } from "next/navigation";

export default async function ProfileRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ tab: "activite" });
  if (typeof sp.success === "string") qs.set("success", sp.success);
  if (typeof sp.invite === "string") qs.set("invite", sp.invite);
  redirect(`/app/reglages?${qs.toString()}`);
}
