"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export async function copyToClipboard(value: string, success = "Copié") {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(success);
    return true;
  } catch {
    // Presse-papiers refusé (navigateur, contexte non sécurisé) : la valeur reste lisible.
    toast.message(value);
    return false;
  }
}

export function CopyButton({ value, label = "Copier", success }: { value: string; label?: string; success?: string }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => void copyToClipboard(value, success)}>
      <Copy className="size-3.5" />
      {label}
    </Button>
  );
}
