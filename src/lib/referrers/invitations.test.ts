import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.fn();
vi.mock("@/lib/email/send-email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

import { createFakeDb } from "@/test-utils/fake-supabase";

import { acceptReferrerInvitation } from "./accept-invitation";
import { hashInvitationToken } from "./invitation-token";
import {
  cancelReferrerInvitation,
  createReferrerInvitation,
  loadReferrerInvitation,
  resendReferrerInvitation,
} from "./invitations";

const NOW = new Date("2026-10-24T08:00:00.000Z");
const INPUT = { email: "paul@exemple.fr", first_name: "Paul", last_name: "Martin", siren: "732829320", adminUserId: "admin-1" };
const tokenFrom = (url: string) => url.split("/apporteur/invitation/")[1]!;

function setup(opts: { existingUser?: string | null; tables?: Record<string, Record<string, unknown>[]>; claim?: { status: string } } = {}) {
  const fake = createFakeDb(
    { business_referrers: [], business_referrer_invitations: [], ...opts.tables },
    {
      now: () => NOW,
      rpc: {
        lookup_auth_user_id_by_email: () => ({ data: opts.existingUser ?? null, error: null }),
        claim_business_referrer_invitation: () => ({ data: opts.claim ?? { status: "claimed", referrer_id: "ref-1" }, error: null }),
      },
    },
  );
  const createUser = vi.fn(async () => ({ data: { user: { id: "user-new" } }, error: null }));
  const deleteUser = vi.fn(async () => ({ data: null, error: null }));
  (fake.db as unknown as { auth: unknown }).auth = { admin: { createUser, deleteUser } };
  return { ...fake, createUser, deleteUser };
}

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue({ ok: true, id: "m1", provider: "console" });
});

describe("création par l'admin", () => {
  it("jeton jamais stocké en clair : seul son SHA-256 est en base ; e-mail envoyé à l'adresse saisie", async () => {
    const { db, tables } = setup();
    const res = await createReferrerInvitation(db, INPUT, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const token = tokenFrom(res.url);
    const row = tables.business_referrer_invitations[0]!;
    expect(row.token_hash).toBe(hashInvitationToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.expires_at).toBe("2026-11-07T08:00:00.000Z");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "paul@exemple.fr" }));
    expect(res.sent).toBe(true);
  });

  it("adresse ayant déjà un compte Soline : refus, rien créé ni envoyé", async () => {
    const { db, tables } = setup({ existingUser: "user-artisan" });
    expect(await createReferrerInvitation(db, INPUT, NOW)).toEqual({ ok: false, error: "email_has_account" });
    expect(tables.business_referrer_invitations).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("invitation ouverte existante : refus (renvoyer plutôt) ; expirée : clôturée et remplacée", async () => {
    const open = { id: "inv-1", email: INPUT.email, expires_at: "2026-11-01T00:00:00.000Z", claimed_at: null, cancelled_at: null, send_count: 1 };
    expect(await createReferrerInvitation(setup({ tables: { business_referrer_invitations: [{ ...open }] } }).db, INPUT, NOW)).toEqual({
      ok: false,
      error: "already_invited",
    });

    const expired = { ...open, expires_at: "2026-10-01T00:00:00.000Z" };
    const { db, tables } = setup({ tables: { business_referrer_invitations: [{ ...expired }] } });
    const res = await createReferrerInvitation(db, INPUT, NOW);
    expect(res.ok).toBe(true);
    expect(tables.business_referrer_invitations[0]!.cancelled_at).toBe(NOW.toISOString());
    expect(tables.business_referrer_invitations).toHaveLength(2);
  });

  it("e-mail en échec : invitation créée, signalée non envoyée (lien à transmettre)", async () => {
    sendEmail.mockResolvedValue({ ok: false, error: "resend down" });
    const { db, tables } = setup();
    const res = await createReferrerInvitation(db, INPUT, NOW);
    expect(res).toMatchObject({ ok: true, sent: false });
    expect(tables.business_referrer_invitations[0]!.sent_at ?? null).toBeNull();
  });

  it("renvoi : nouveau jeton, l'ancien lien ne fonctionne plus", async () => {
    const { db } = setup();
    const first = await createReferrerInvitation(db, INPUT, NOW);
    if (!first.ok) throw new Error("création");
    const again = await resendReferrerInvitation(db, first.invitationId, NOW);
    if (!again.ok) throw new Error("renvoi");
    expect((await loadReferrerInvitation(db, tokenFrom(first.url), NOW)).ok).toBe(false);
    expect((await loadReferrerInvitation(db, tokenFrom(again.url), NOW)).ok).toBe(true);
  });

  it("annulation : le lien devient inutilisable", async () => {
    const { db } = setup();
    const res = await createReferrerInvitation(db, INPUT, NOW);
    if (!res.ok) throw new Error("création");
    expect(await cancelReferrerInvitation(db, res.invitationId, NOW)).toBe(true);
    expect(await loadReferrerInvitation(db, tokenFrom(res.url), NOW)).toEqual({ ok: false, reason: "cancelled" });
  });
});

describe("lien d'invitation", () => {
  it("format invalide ou inconnu → invalid ; expiré → expired", async () => {
    const { db } = setup();
    expect(await loadReferrerInvitation(db, "abc", NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(await loadReferrerInvitation(db, "A".repeat(43), NOW)).toEqual({ ok: false, reason: "invalid" });
    const res = await createReferrerInvitation(db, INPUT, NOW);
    if (!res.ok) throw new Error("création");
    expect(await loadReferrerInvitation(db, tokenFrom(res.url), new Date("2026-11-08T00:00:00Z"))).toEqual({ ok: false, reason: "expired" });
  });
});

describe("finalisation", () => {
  const FORM = {
    first_name: "Paul",
    last_name: "Martin",
    phone: "0612345678",
    business_name: "PM Conseil",
    siret: "",
    address_line1: "12 rue des Lilas",
    address_line2: "",
    postal_code: "11000",
    city: "Carcassonne",
    vat_regime: "franchise",
    vat_number: "",
    password: "motdepasse1",
    password_confirm: "motdepasse1",
    accept_terms: "1",
  };

  async function invited(opts: Parameters<typeof setup>[0] = {}) {
    const ctx = setup(opts);
    const res = await createReferrerInvitation(ctx.db, INPUT, NOW);
    if (!res.ok) throw new Error("création");
    return { ...ctx, token: tokenFrom(res.url) };
  }

  it("compte créé pour l'adresse de l'INVITATION (e-mail confirmé), consommation atomique en base", async () => {
    const ctx = await invited();
    const res = await acceptReferrerInvitation(ctx.db, { token: ctx.token, raw: { ...FORM, email: "pirate@x.fr" }, termsVersion: "v1" }, NOW);
    expect(res).toEqual({ ok: true, email: INPUT.email });
    expect(ctx.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: INPUT.email, email_confirm: true }));
    const claim = ctx.calls.find((c) => c.table === "rpc:claim_business_referrer_invitation")!;
    expect(claim.payload).toMatchObject({ p_token_hash: hashInvitationToken(ctx.token), p_user_id: "user-new", p_email: INPUT.email, p_phone: "+33612345678" });
    expect(ctx.deleteUser).not.toHaveBeenCalled();
  });

  it("lien utilisé entre-temps (double clic, deux onglets) : compte Auth supprimé, erreur explicite", async () => {
    const ctx = await invited({ claim: { status: "already_claimed" } });
    const res = await acceptReferrerInvitation(ctx.db, { token: ctx.token, raw: FORM, termsVersion: "v1" }, NOW);
    expect(res).toEqual({ ok: false, error: "link_used" });
    expect(ctx.deleteUser).toHaveBeenCalledWith("user-new");
  });

  it("saisies invalides : aucun compte créé", async () => {
    const ctx = await invited();
    const res = await acceptReferrerInvitation(ctx.db, { token: ctx.token, raw: { ...FORM, password_confirm: "x" }, termsVersion: "v1" }, NOW);
    expect(res).toMatchObject({ ok: false, error: "invalid_fields" });
    expect(ctx.createUser).not.toHaveBeenCalled();
  });

  it("adresse prise entre l'invitation et la finalisation : erreur, pas de consommation", async () => {
    const ctx = await invited();
    ctx.createUser.mockResolvedValueOnce({ data: { user: null }, error: { code: "email_exists", status: 422, message: "exists" } } as never);
    const res = await acceptReferrerInvitation(ctx.db, { token: ctx.token, raw: FORM, termsVersion: "v1" }, NOW);
    expect(res).toEqual({ ok: false, error: "email_has_account" });
    expect(ctx.calls.some((c) => c.table === "rpc:claim_business_referrer_invitation")).toBe(false);
  });

  it("lien inconnu : aucun compte créé", async () => {
    const ctx = setup();
    expect(await acceptReferrerInvitation(ctx.db, { token: "B".repeat(43), raw: FORM, termsVersion: "v1" }, NOW)).toEqual({ ok: false, error: "link_invalid" });
    expect(ctx.createUser).not.toHaveBeenCalled();
  });
});
