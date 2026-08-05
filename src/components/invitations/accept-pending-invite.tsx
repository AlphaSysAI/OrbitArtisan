"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { acceptPlatformInvitation } from "@/lib/invitations/actions";

export function AcceptPendingInvite() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const invite = searchParams.get("invite");
  const processed = useRef(false);

  useEffect(() => {
    if (!invite || processed.current) return;
    processed.current = true;

    void (async () => {
      const res = await acceptPlatformInvitation(invite);
      if (!res.ok) {
        if (res.error === "email_mismatch") {
          toast.error("Utilise l’adresse e-mail indiquée dans l’invitation pour ce compte.");
        }
        return;
      }

      toast.success(
        res.accountType === "artisan"
          ? "Invitation acceptée — configure ton activité."
          : "Invitation acceptée.",
      );

      const dest =
        res.accountType === "artisan"
          ? "/app/reglages?tab=activite&success=invite"
          : "/compte/contacts?success=invite";

      router.replace(dest);
      router.refresh();
    })();
  }, [invite, router]);

  return null;
}
