import { describe, expect, it } from "vitest";

import { seenCategoryForPath } from "@/lib/notifications/seen-category";

describe("seenCategoryForPath", () => {
  it.each([
    ["/app/quotes", "quotes_accepted"],
    ["/app/quotes/abc", "quotes_accepted"],
    ["/app/quotes/new", "quotes_accepted"],
    ["/mes-devis", "quotes_received"],
    ["/mes-devis/abc", "quotes_received"],
    ["/compte/factures", "invoices_received"],
    ["/compte/factures/abc", "invoices_received"],
  ])("%s → %s", (path, expected) => {
    expect(seenCategoryForPath(path)).toBe(expected);
  });

  it.each([null, "/app", "/app/appels", "/app/quotesx", "/compte", "/app/invoices"])("%s → null", (path) => {
    expect(seenCategoryForPath(path)).toBeNull();
  });
});
