import { beforeEach, describe, expect, it, vi } from "vitest";

const seed = vi.fn();
vi.mock("@/lib/work-library/actions", () => ({ seedDefaultWorkLibraryForUser: (...a: unknown[]) => seed(...a) }));
let serviceDb: unknown = null;
vi.mock("@/lib/supabase/service-role", () => ({ createSupabaseServiceRoleClient: () => serviceDb }));

import type { User } from "@supabase/supabase-js";

import { isProvisionalSlug } from "@/lib/profile/provisional-slug";
import { createFakeDb } from "@/test-utils/fake-supabase";

import { ensureArtisanProfile, finalizeProvisionalSlug } from "./ensure-artisan-profile";

const USER = { id: "user-1", user_metadata: { registration_ip: "1.2.3.4", registration_recorded_at: "2026-10-26T08:00:00.000Z" } } as unknown as User;

function setup(tables: Record<string, Record<string, unknown>[]> = {}, insertError?: { code: string; message: string }) {
  return createFakeDb(
    { profiles: [], customer_profiles: [], business_referrers: [], ...tables },
    { insertError: insertError ? { profiles: insertError } : undefined },
  );
}

beforeEach(() => {
  seed.mockReset();
  serviceDb = null;
});

describe("création de la fiche au premier passage", () => {
  it("nouveau compte : fiche vide, abonnement incomplete, slug provisoire, bibliothèque créée", async () => {
    const { db, tables } = setup();
    expect(await ensureArtisanProfile(db, USER)).toBe("created");
    const p = tables.profiles[0]!;
    expect(p).toMatchObject({ user_id: "user-1", business_name: "", subscription_status: "incomplete", trial_ends_at: null, registration_ip: "1.2.3.4" });
    expect(isProvisionalSlug(p.slug as string)).toBe(true);
    expect(seed).toHaveBeenCalledWith("user-1");
  });

  it("fiche existante : rien n'est recréé", async () => {
    const { db, tables } = setup({ profiles: [{ id: "p1", user_id: "user-1" }] });
    expect(await ensureArtisanProfile(db, USER)).toBe("exists");
    expect(tables.profiles).toHaveLength(1);
    expect(seed).not.toHaveBeenCalled();
  });

  it("compte client ou apporteur : jamais transformé en artisan", async () => {
    const client = setup({ customer_profiles: [{ id: "c1", user_id: "user-1" }] });
    expect(await ensureArtisanProfile(client.db, USER)).toBe("client");
    expect(client.tables.profiles).toHaveLength(0);
    const referrer = setup({ business_referrers: [{ id: "r1", user_id: "user-1" }] });
    expect(await ensureArtisanProfile(referrer.db, USER)).toBe("referrer");
    expect(referrer.tables.profiles).toHaveLength(0);
  });

  it("échec d'écriture : signalé, pas de bibliothèque créée", async () => {
    const { db } = setup({}, { code: "42501", message: "permission denied" });
    expect(await ensureArtisanProfile(db, USER)).toBe("failed");
    expect(seed).not.toHaveBeenCalled();
  });
});

describe("slug définitif en fin d'onboarding", () => {
  it("slug provisoire remplacé par la raison sociale, suffixe si déjà pris", async () => {
    const { db, tables } = setup({
      profiles: [
        { id: "p1", user_id: "user-1", slug: "nouveau-0123456789ab", business_name: "Plomberie Dupont" },
        { id: "p2", user_id: "user-2", slug: "plomberie-dupont", business_name: "Autre" },
      ],
    });
    serviceDb = db;
    await finalizeProvisionalSlug(db, "p1");
    expect(tables.profiles[0]!.slug).toBe("plomberie-dupont-2");
  });

  it("slug choisi par l'artisan : jamais modifié", async () => {
    const { db, tables } = setup({ profiles: [{ id: "p1", slug: "mon-slug", business_name: "Plomberie Dupont" }] });
    serviceDb = db;
    await finalizeProvisionalSlug(db, "p1");
    expect(tables.profiles[0]!.slug).toBe("mon-slug");
  });

  it("raison sociale toujours vide : slug provisoire conservé", async () => {
    const { db, tables } = setup({ profiles: [{ id: "p1", slug: "nouveau-0123456789ab", business_name: "" }] });
    serviceDb = db;
    await finalizeProvisionalSlug(db, "p1");
    expect(tables.profiles[0]!.slug).toBe("nouveau-0123456789ab");
  });
});
