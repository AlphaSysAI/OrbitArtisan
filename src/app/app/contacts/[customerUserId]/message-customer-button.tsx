"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getOrCreateArtisanCustomerConversation } from "@/lib/contacts/actions";

export function MessageCustomerButton({ customerUserId }: { customerUserId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function openMessage() {
    setLoading(true);
    const res = await getOrCreateArtisanCustomerConversation(customerUserId);
    setLoading(false);
    if (!res.ok) {
      toast.error("Impossible d’ouvrir la conversation.");
      return;
    }
    router.push(`/app/messages/${res.conversationId}`);
  }

  return (
    <Button type="button" className="gap-2" disabled={loading} onClick={openMessage}>
      <MessageSquare className="h-4 w-4" />
      {loading ? "Ouverture…" : "Envoyer un message"}
    </Button>
  );
}
