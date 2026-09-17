"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { deleteQuote } from "@/app/app/quotes/actions";
import { Button } from "@/components/ui/button";

export function DeleteQuoteButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleClick() {
    if (!confirm("Supprimer définitivement ce brouillon ? Cette action est irréversible.")) return;
    setPending(true);
    const res = await deleteQuote(quoteId);
    setPending(false);
    if (!res.ok) {
      toast.error(
        res.error === "not_deletable"
          ? "Ce devis n'est plus un brouillon, il ne peut plus être supprimé."
          : "Impossible de supprimer ce devis.",
      );
      return;
    }
    toast.success("Brouillon supprimé.");
    router.push("/app/quotes");
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="border-red-500/60 text-red-700 hover:bg-red-500/10"
      disabled={pending}
      onClick={() => void handleClick()}
    >
      <Trash2 className="mr-2 size-4" />
      {pending ? "…" : "Supprimer"}
    </Button>
  );
}
