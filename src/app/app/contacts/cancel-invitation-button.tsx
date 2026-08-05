"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cancelPlatformInvitation } from "@/lib/invitations/actions";

export function CancelInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onCancel() {
    setLoading(true);
    const res = await cancelPlatformInvitation(invitationId);
    setLoading(false);
    if (!res.ok) {
      toast.error("Impossible d’annuler l’invitation.");
      return;
    }
    toast.success("Invitation annulée");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={onCancel}>
      Annuler
    </Button>
  );
}
