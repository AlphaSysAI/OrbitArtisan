import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Garde-fous de la migration 44 (profils artisans privés) :
 * - la vue publique n'expose que des colonnes sûres ;
 * - les pages publiques et l'espace client ne lisent jamais la table `profiles`
 *   directement (ils passent par la vue ou par le serveur après contrôle d'accès).
 */

const ROOT = process.cwd();

const FORBIDDEN_PUBLIC_COLUMNS = [
  "registration_ip",
  "stripe_account_id",
  "stripe_customer_id",
  "stripe_subscription_id",
  "subscription_plan",
  "subscription_status",
  "accountant_email",
  "accountant_confirm_token_hash",
  "labor_rate_per_hour",
  "siret",
  "siren",
  "vat_number",
  "address_line1",
  "decennale_policy_number",
  "visit_hours",
  "voice_overage_cap_cents",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

describe("vue artisan_public_profiles", () => {
  const sql = readFileSync(join(ROOT, "supabase/migration/44_artisan_public_profiles_view.sql"), "utf8");
  const viewBody = sql.slice(sql.indexOf("create or replace view public.artisan_public_profiles"), sql.indexOf("from public.profiles p"));

  it("liste ses colonnes explicitement (jamais select *)", () => {
    expect(viewBody).not.toMatch(/p\.\*/);
  });

  it.each(FORBIDDEN_PUBLIC_COLUMNS)("n'expose pas %s", (column) => {
    expect(viewBody).not.toMatch(new RegExp(`\\bp\\.${column}\\b`));
  });
});

describe("pages publiques et espace client", () => {
  const publicDirs = ["src/app/site", "src/app/embed", "src/app/estimation", "src/app/compte", "src/app/mes-devis"];
  const files = publicDirs.flatMap((d) => walk(join(ROOT, d)));

  it.each(files.map((f) => f.replace(`${ROOT}/`, "")))("%s ne lit pas la table profiles avec le client de session", (file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    // Seuls les accès explicitement passés par le service role sont tolérés.
    const direct = source
      .split("\n")
      .filter((line) => line.includes('from("profiles")'))
      .filter((line, i, lines) => !/ServiceRole|admin/.test(lines[i - 1] ?? "") && !/ServiceRole|admin/.test(line));
    const serviceRoleUses = (source.match(/createSupabaseServiceRoleClient\(\) \?\? supabase\)\s*\n\s*\.from\("profiles"\)/g) ?? []).length;
    const ownProfileUses = (source.match(/from\("profiles"\)\.select\("id"\)\.eq\("user_id", user\.id\)/g) ?? []).length;
    expect(direct.length - serviceRoleUses - ownProfileUses).toBeLessThanOrEqual(0);
  });
});
