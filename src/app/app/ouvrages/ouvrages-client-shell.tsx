"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { PlatformCatalogPanel } from "@/components/work-library/platform-catalog-panel";
import type { PlatformWorkItem } from "@/lib/work-library/platform-catalog-types";
import type { WorkCategory, WorkItemWithCategory } from "@/lib/work-library/types";

import { WorkLibraryManager } from "./work-library-manager";

export function OuvragesClientShell({
  platformItems,
  platformTradeLabel,
  tradeConfigured,
  initialItems,
  categories,
  defaultHourlyRateHt,
}: {
  platformItems: PlatformWorkItem[];
  platformTradeLabel: string | null;
  tradeConfigured: boolean;
  initialItems: WorkItemWithCategory[];
  categories: WorkCategory[];
  defaultHourlyRateHt: number;
}) {
  const router = useRouter();
  const [libraryKey, setLibraryKey] = React.useState(0);

  function handleImported() {
    router.refresh();
    setLibraryKey((k) => k + 1);
  }

  return (
    <>
      <PlatformCatalogPanel
        items={platformItems}
        tradeLabel={platformTradeLabel}
        tradeConfigured={tradeConfigured}
        onImported={handleImported}
      />

      <div className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">Ma bibliothèque</h2>
        <p className="text-sm text-muted-foreground">
          Ouvrages que tu as créés, importés depuis le catalogue Soline ou ajoutés depuis tes devis.
        </p>
      </div>

      <WorkLibraryManager
        key={libraryKey}
        initialItems={initialItems}
        categories={categories}
        defaultHourlyRateHt={defaultHourlyRateHt}
      />
    </>
  );
}
