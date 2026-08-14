import { redirect } from "next/navigation";

import { LeadSentPanel } from "@/components/leads/lead-sent-panel";
import { prepareLeadClientSignup } from "@/lib/leads/client-signup";
import { getLeadSignupPreview } from "@/lib/leads/client-signup";

export default async function EstimationSuiviPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token.trim() : "";
  if (!token) redirect("/estimation");

  const preview = await getLeadSignupPreview(token);
  if (!preview.ok) redirect("/estimation");

  const signup = preview.canSignup ? await prepareLeadClientSignup(token) : preview;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto max-w-lg px-6 py-16">
        <LeadSentPanel leadToken={token} signup={signup} compact />
      </div>
    </div>
  );
}
