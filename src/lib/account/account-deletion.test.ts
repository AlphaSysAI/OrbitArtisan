import { beforeEach, describe, expect, it, vi } from "vitest";

const cancel = vi.fn();
let stripeConfigured = true;
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({ subscriptions: { cancel: (...a: unknown[]) => cancel(...a) } }),
  isStripeConfigured: () => stripeConfigured,
}));
const sendEmail = vi.fn();
vi.mock("@/lib/email/send-email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
const syncNumber = vi.fn();
vi.mock("@/lib/voice/subscription-voice-number-sync", () => ({ syncSubscriptionVoiceNumber: (...a: unknown[]) => syncNumber(...a) }));

import type { SupabaseClient } from "@supabase/supabase-js";

import { createFakeDb } from "@/test-utils/fake-supabase";

import { cancelAccountDeletion, pendingAccountDeletion, purgeDueAccountDeletions, requestArtisanAccountDeletion } from "./account-deletion";

const NOW = new Date("2026-10-26T10:00:00.000Z");
const PURGE = "2026-11-25T10:00:00.000Z";

function profile(extra: Record<string, unknown> = {}) {
  return {
    id: "p1",
    user_id: "u1",
    business_name: "Dupont Rénovation",
    first_name: "Marc",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    subscription_plan: "pro",
    subscription_status: "active",
    account_status: "active",
    deleted_at: null,
    lead_matching_enabled: true,
    ...extra,
  };
}

function setup(tables: Record<string, Record<string, unknown>[]> = {}) {
  const fake = createFakeDb({
    profiles: [profile()],
    account_deletions: [],
    conversations: [],
    platform_admins: [],
    customer_profiles: [],
    business_referrers: [],
    ...tables,
  });
  const files: Record<string, string[]> = { "vitrine-media": ["p1/logo.png", "p1/photos/a.jpg"], "message-documents": ["c1/devis.pdf"] };
  const removed: string[] = [];
  const deletedUsers: string[] = [];
  const db = fake.db as unknown as Record<string, unknown>;
  db.storage = {
    from: (bucket: string) => ({
      list: async (prefix: string) => {
        const inBucket = (files[bucket] ?? []).filter((p) => p.startsWith(`${prefix}/`));
        const names = new Map<string, boolean>();
        for (const p of inBucket) {
          const rest = p.slice(prefix.length + 1);
          const [head, ...tail] = rest.split("/");
          names.set(head!, tail.length === 0);
        }
        return { data: [...names].map(([name, isFile]) => ({ name, id: isFile ? `f-${name}` : null })), error: null };
      },
      remove: async (paths: string[]) => {
        removed.push(...paths.map((p) => `${bucket}:${p}`));
        return { data: null, error: null };
      },
    }),
  };
  db.auth = { admin: { deleteUser: async (id: string) => (deletedUsers.push(id), { error: null }) } };
  return { ...fake, db: db as unknown as SupabaseClient, removed, deletedUsers };
}

const request = (db: SupabaseClient) => requestArtisanAccountDeletion(db, { profileId: "p1", userId: "u1", email: "marc@example.fr" }, NOW);

beforeEach(() => {
  cancel.mockReset().mockResolvedValue({ id: "sub_1", status: "canceled" });
  sendEmail.mockReset().mockResolvedValue({ ok: true });
  syncNumber.mockReset().mockResolvedValue(undefined);
  stripeConfigured = true;
});

describe("demande de suppression", () => {
  it("résilie Stripe sans prorata, ferme le compte, libère le numéro, programme l'effacement à J+30", async () => {
    const { db, tables } = setup();
    expect(await request(db)).toEqual({ ok: true, purgeAfter: PURGE, alreadyRequested: false });
    expect(cancel).toHaveBeenCalledWith("sub_1", { prorate: false, invoice_now: false });
    expect(tables.profiles[0]).toMatchObject({
      deleted_at: NOW.toISOString(),
      account_status: "suspended",
      subscription_status: "canceled",
      lead_matching_enabled: false,
    });
    expect(tables.account_deletions[0]).toMatchObject({ profile_id: "p1", user_id: "u1", stripe_customer_id: "cus_1", purge_after: PURGE, requested_by: "artisan" });
    expect(syncNumber).toHaveBeenCalledWith(db, { profileId: "p1", planId: "pro", subscriptionStatus: "canceled" });
    const mail = sendEmail.mock.calls[0]![0] as { to: string; text: string };
    expect(mail.to).toBe("marc@example.fr");
    expect(mail.text).toMatch(/sans remboursement/);
  });

  it("échec Stripe : rien n'est modifié (sinon compte fermé mais toujours prélevé)", async () => {
    cancel.mockRejectedValue(Object.assign(new Error("api down"), { code: "api_error" }));
    const { db, tables } = setup();
    expect(await request(db)).toEqual({ ok: false, error: "stripe_failed" });
    expect(tables.profiles[0]).toMatchObject({ deleted_at: null, account_status: "active", subscription_status: "active" });
    expect(tables.account_deletions).toHaveLength(0);
    expect(syncNumber).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("abonnement déjà résilié chez Stripe : la suppression continue", async () => {
    cancel.mockRejectedValue(Object.assign(new Error("No such subscription"), { code: "resource_missing" }));
    const { db, tables } = setup();
    expect((await request(db)).ok).toBe(true);
    expect(tables.account_deletions).toHaveLength(1);
  });

  it("sans abonnement Stripe : pas d'appel Stripe", async () => {
    const { db } = setup({ profiles: [profile({ stripe_subscription_id: null })] });
    expect((await request(db)).ok).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("idempotent : une seconde demande renvoie la date déjà fixée", async () => {
    const { db, tables } = setup();
    await request(db);
    expect(await request(db)).toEqual({ ok: true, purgeAfter: PURGE, alreadyRequested: true });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(tables.account_deletions).toHaveLength(1);
  });

  it("fiche d'un autre utilisateur : refus", async () => {
    const { db, tables } = setup();
    const res = await requestArtisanAccountDeletion(db, { profileId: "p1", userId: "u2", email: null }, NOW);
    expect(res).toEqual({ ok: false, error: "not_found" });
    expect(cancel).not.toHaveBeenCalled();
    expect(tables.profiles[0]!.deleted_at).toBeNull();
  });
});

describe("annulation et effacement", () => {
  it("annulation pendant le délai : plus de demande en attente", async () => {
    const { db } = setup();
    await request(db);
    expect(await pendingAccountDeletion(db, "p1")).toEqual({ requestedAt: NOW.toISOString(), purgeAfter: PURGE });
    expect(await cancelAccountDeletion(db, "p1", NOW)).toBe(true);
    expect(await pendingAccountDeletion(db, "p1")).toBeNull();
  });

  it("avant J+30 : rien n'est effacé", async () => {
    const { db, tables } = setup({ conversations: [{ id: "c1", artisan_id: "p1" }] });
    await request(db);
    expect(await purgeDueAccountDeletions(db, new Date("2026-11-25T09:59:00.000Z"))).toEqual({ purged: 0, failed: 0, files: 0 });
    expect(tables.profiles).toHaveLength(1);
  });

  it("à J+30 : fichiers, fiche et compte de connexion effacés, trace conservée", async () => {
    const { db, tables, removed, deletedUsers } = setup({ conversations: [{ id: "c1", artisan_id: "p1" }] });
    await request(db);
    const report = await purgeDueAccountDeletions(db, new Date(PURGE));
    expect(report).toEqual({ purged: 1, failed: 0, files: 3 });
    expect(removed.sort()).toEqual(["message-documents:c1/devis.pdf", "vitrine-media:p1/logo.png", "vitrine-media:p1/photos/a.jpg"]);
    expect(tables.profiles).toHaveLength(0);
    expect(deletedUsers).toEqual(["u1"]);
    expect(tables.account_deletions[0]!.purged_at).toBe(PURGE);
    expect(await purgeDueAccountDeletions(db, new Date(PURGE))).toEqual({ purged: 0, failed: 0, files: 0 });
  });

  it("compte rouvert par l'admin sans annulation : jamais effacé", async () => {
    const { db, tables } = setup();
    await request(db);
    tables.profiles[0]!.deleted_at = null;
    expect((await purgeDueAccountDeletions(db, new Date(PURGE))).purged).toBe(0);
    expect(tables.profiles).toHaveLength(1);
    expect(tables.account_deletions[0]!.cancelled_at).toBe(PURGE);
  });

  it("utilisateur aussi client ou admin : la fiche est effacée, pas le compte de connexion", async () => {
    const { db, tables, deletedUsers } = setup({ customer_profiles: [{ id: "cp1", user_id: "u1" }] });
    await request(db);
    expect((await purgeDueAccountDeletions(db, new Date(PURGE))).purged).toBe(1);
    expect(tables.profiles).toHaveLength(0);
    expect(deletedUsers).toEqual([]);
  });
});
