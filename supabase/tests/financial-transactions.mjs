// Test local en mémoire. SOLINE_PGLITE_DIST pointe vers le répertoire dist de PGlite.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

if (!process.env.SOLINE_PGLITE_DIST) throw new Error("Indiquer SOLINE_PGLITE_DIST");
const load = (file) => import(pathToFileURL(resolve(process.env.SOLINE_PGLITE_DIST, file)).href);
const { PGlite } = await load("index.js");
const { pgcrypto } = await load("contrib/pgcrypto.js");
const { btree_gist } = await load("contrib/btree_gist.js");
const db = new PGlite({ extensions: { pgcrypto, btree_gist } });

await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key, email text, created_at timestamptz default now(), raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key, bucket_id text, name text, owner uuid, owner_id text);
alter table storage.objects enable row level security;
create domain vector as real[];
`);
const init = readFileSync('supabase/init.sql','utf8');
const sql = init.replace('create extension if not exists vector;', '').replaceAll('vector(1024)','vector')
  .replace(/create index if not exists [^;]*using ivfflat[^;]*;/gi,'')
  .replace(/create or replace function public.match_supplier_products\([\s\S]*?grant execute on function public.match_supplier_products\(vector, int, float\) to authenticated;/i,'');
try { await db.exec(sql); } catch(e) { const i=Number(e.position)-1; console.error(e.message, sql.slice(i-110,i+140)); process.exit(1); }
for (const file of readdirSync('supabase/migration').filter(x=>x.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync('supabase/migration/'+file,'utf8')); }
  catch (e) { console.error(file,e.message); process.exit(1); }
}
await db.exec('grant usage on schema public to anon, authenticated, service_role; grant select, insert, update, delete on all tables in schema public to authenticated, service_role;');
const user = "00000000-0000-4000-8000-000000000001";
const artisan = "00000000-0000-4000-8000-000000000002";
const secondUser = "00000000-0000-4000-8000-000000000003";
const secondArtisan = "00000000-0000-4000-8000-000000000004";
const query = async (sql, args = []) => (await db.query(sql, args)).rows[0];
try {
  await db.exec(`
    insert into auth.users (id, email) values ('${user}', 'a@example.invalid'), ('${secondUser}', 'b@example.invalid');
    insert into profiles (id, user_id, slug, business_name) values
      ('${artisan}', '${user}', 'test-a', 'A'), ('${secondArtisan}', '${secondUser}', 'test-b', 'B');
    set role authenticated;
    select set_config('request.jwt.claim.sub', '${user}', false);
  `);
  const header = { artisan_id: artisan, customer_name: "Client fictif", labor_rate_per_hour: 5000,
    labor_duration_minutes: 0, labor_total: 0, materials_total: 10000, grand_total: 10000, generate_vat_attestation: false,
    retraction_waived: false };
  const material = { label: "Test", quantity: 2.5, unit_price: 4000, line_total: 10000, vat_rate: 10,
    exclude_from_invoice: false, is_supplier_catalog: false };
  const saveQuote = (id, materials, send) => query("select save_quote_document($1, $2, $3, $4, $5) as id",
    [id, header, JSON.stringify([]), JSON.stringify(materials), send]);
  const sent = await saveQuote(null, [material], true);
  assert.deepEqual(await query("select status, (select count(*)::int from quote_materials where quote_id = quotes.id) as lines from quotes where id = $1", [sent.id]),
    { status: "sent", lines: 1 });
  const draft = await saveQuote(null, [material], false);
  await assert.rejects(saveQuote(draft.id, [{ ...material, quantity: 0 }], true));
  assert.equal((await query("select status from quotes where id = $1", [draft.id])).status, "draft");
  assert.equal((await query("select quantity::float as qty from quote_materials where quote_id = $1", [draft.id])).qty, 2.5);
  await assert.rejects(saveQuote(draft.id, [{ ...material, line_total: 9999 }], true), /inconsistent_quote_total/);
  const direct = { ...material, label: "Achat direct", exclude_from_invoice: true, unit: "m2", supplier_sku: "TEST-1" };
  const copied = await saveQuote(null, [material, direct], false);
  assert.deepEqual(await query("select exclude_from_invoice, supplier_sku from quote_materials where quote_id = $1 and label = 'Achat direct'", [copied.id]),
    { exclude_from_invoice: true, supplier_sku: "TEST-1" });
  const wrongRevision = await query("select send_quote_document($1, $2, '2000-01-01') as id", [copied.id, artisan]);
  assert.equal(wrongRevision.id, null);
  await db.exec("reset role");
  await query("update quotes set status = 'accepted' where id = $1", [sent.id]);
  await db.exec("set role authenticated");
  const draftInvoice = { artisan_id: artisan, quote_id: sent.id, invoice_type: "deposit", labor_total: 0, materials_total: 0,
    grand_total: 3000, operation_type: "prestation_services", vat_on_debits: false, vat_collection_nature: "on_delivery",
    e_invoicing_status: "DRAFT" };
  const invoiceLine = { line_kind: "service", label: "Acompte", quantity: 1, unit_price: 3000,
    line_total: 3000, sort_order: 0, vat_rate: 10, vat_category_code: "AA" };
  const saveInvoice = (lines, expected) => query("select save_invoice_draft($1, $2, $3) as id",
    [draftInvoice, JSON.stringify(lines), expected]);
  await assert.rejects(saveInvoice([{ ...invoiceLine, line_total: 2000 }], 0), /invoice_lines_total_mismatch/);
  assert.equal((await query("select count(*)::int as n from invoices")).n, 0);
  const invoice = await saveInvoice([invoiceLine], 0);
  await assert.rejects(saveInvoice([invoiceLine], 0), /invoice_total_changed/);
  assert.equal((await query("select line_total from invoice_lines where invoice_id = $1", [invoice.id])).line_total, 3000);
  await db.exec(`select set_config('request.jwt.claim.sub', '${secondUser}', false)`);
  await assert.rejects(saveInvoice([invoiceLine], 3000), /quote_not_accepted/);
  await assert.rejects(saveQuote(draft.id, [material], true), /quote_not_editable/);
  await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false)`);
  const claim = new Date().toISOString();
  await query("update invoices set finalizing_at = $1 where id = $2", [claim, invoice.id]);
  await assert.rejects(query("update invoice_lines set vat_rate = 20 where invoice_id = $1", [invoice.id]), /invoice_lines_locked/);
  await db.exec("set role service_role");
  await db.exec("select set_config('request.jwt.claim.role', 'service_role', false)");
  const number = (await query("select reserve_invoice_number($1, $2) as number", [invoice.id, claim])).number;
  assert.equal((await query("select reserve_invoice_number($1, $2) as number", [invoice.id, claim])).number, number);
  const issueArgs = [invoice.id, claim, number, claim, "2026-12-04", "JVBERg==", { invoiceId: invoice.id }, "2026-11-01"];
  const issue = "select issue_b2c_invoice($1,$2,$3,$4,$5,$6,$7,$8) as id";
  await db.exec("set role authenticated");
  await assert.rejects(query(issue, issueArgs), /permission denied/);
  await db.exec("set role service_role");
  await assert.rejects(query(issue, [invoice.id, "2026-11-04T13:00:00Z", ...issueArgs.slice(2)]), /invoice_claim_lost/);
  await query(issue, issueArgs);
  await assert.rejects(query(issue, issueArgs), /invoice_claim_lost/);
  assert.deepEqual(await query("select status, issued_pdf_base64 as pdf from invoices where id = $1", [invoice.id]),
    { status: "sent", pdf: "JVBERg==" });
  assert.equal((await query("select count(*)::int as n from e_reporting_queue where invoice_id = $1", [invoice.id])).n, 1);
  await db.exec("set role authenticated");
  await assert.rejects(query("update invoices set issued_pdf_base64 = 'x' where id = $1", [invoice.id]), /invoice_issued_immutable/);
  const credit = { ...draftInvoice, invoice_type: "credit_note", parent_invoice_id: invoice.id, credit_note_for_invoice_id: invoice.id };
  const creditDraft = await query("select save_invoice_draft($1, '[]', 0) as id", [credit]);
  assert.equal((await query("select vat_rate::float as rate from invoice_lines where invoice_id = $1", [creditDraft.id])).rate, 10);
  await assert.rejects(query("select save_invoice_draft($1, '[]', 0)", [credit]), /invalid_credit_note/);
  await db.exec("reset role");
  const project = await query("insert into projects(artisan_id, name) values ($1, 'Projet B') returning id", [secondArtisan]);
  await db.exec("set role authenticated");
  await assert.rejects(query("insert into project_time_entries (artisan_id, project_id, duration_minutes) values ($1, $2, 10)",
    [artisan, project.id]), /project_time_entries_project_tenant_fk/);
  await assert.rejects(query("select consume_rate_limit('test', 'abc', 1, 3600)"), /permission denied/);
  await db.exec("set role service_role");
  assert.equal((await query("select consume_rate_limit('test', 'abc', 1, 3600) as allowed")).allowed, true);
  assert.equal((await query("select consume_rate_limit('test', 'abc', 1, 3600) as allowed")).allowed, false);
  await query("insert into voice_post_call_inbox(id, artisan_id, payload) values ('test-event', $1, '{}')", [artisan]);
  assert.equal((await query("select attempts from claim_voice_post_call('test-event')")).attempts, 1);
  assert.equal(await query("select attempts from claim_voice_post_call('test-event')"), undefined);
  await query("update voice_post_call_inbox set claimed_at = now() - interval '4 minutes' where id = 'test-event'");
  assert.equal((await query("select attempts from claim_voice_post_call('test-event')")).attempts, 2);
  console.log("OK : devis, facturation atomique, avoir, isolation, quota et reprise vocale");
} finally {
  await db.close();
}
