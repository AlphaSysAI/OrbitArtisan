/**
 * Base Supabase en mémoire pour les tests (sous-ensemble des requêtes PostgREST utilisées
 * par les outils vocaux). Aucun appel réseau.
 */
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export type FakeDbOptions = {
  /** Erreur renvoyée à l'insertion dans une table (ex. contrainte d'exclusion 23P01). */
  insertError?: Record<string, { code: string; message: string } | undefined>;
  /** Horloge utilisée pour `created_at` des lignes insérées (défaut : horloge réelle). */
  now?: () => Date;
  /** Réponses simulées des fonctions Postgres (la logique SQL est testée sur PostgreSQL). */
  rpc?: Record<string, (args: Record<string, unknown>) => { data: unknown; error: { code: string; message: string } | null }>;
  /** Ancien schéma : colonnes pas encore migrées (erreurs PostgREST 42703 / PGRST204). */
  missingColumns?: Record<string, string[]>;
};

export function createFakeDb(tables: Record<string, Row[]>, options: FakeDbOptions = {}) {
  let seq = 0;
  const calls: { table: string; op: string; payload?: unknown }[] = [];

  function from(table: string) {
    tables[table] ??= [];
    const filters: Filter[] = [];
    let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    let single = false;
    let columns = "*";

    const builder = {
      select(cols?: string) {
        if (op === "select" && typeof cols === "string") columns = cols;
        return builder;
      },
      upsert(data: Row) {
        op = "upsert";
        payload = data;
        return builder;
      },
      delete() {
        op = "delete";
        return builder;
      },
      insert(data: Row | Row[]) {
        op = "insert";
        payload = data;
        return builder;
      },
      update(data: Row) {
        op = "update";
        payload = data;
        return builder;
      },
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return builder;
      },
      neq(col: string, v: unknown) {
        filters.push((r) => r[col] !== v);
        return builder;
      },
      is(col: string, v: unknown) {
        filters.push((r) => (r[col] ?? null) === v);
        return builder;
      },
      in(col: string, values: unknown[]) {
        filters.push((r) => values.includes(r[col]));
        return builder;
      },
      gte(col: string, v: string) {
        filters.push((r) => String(r[col]) >= v);
        return builder;
      },
      gt(col: string, v: string) {
        filters.push((r) => String(r[col]) > v);
        return builder;
      },
      lt(col: string, v: string) {
        filters.push((r) => String(r[col]) < v);
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      single() {
        single = true;
        return builder;
      },
      maybeSingle() {
        single = true;
        return builder;
      },
      then(resolve: (v: { data: unknown; error: unknown }) => void) {
        resolve(run());
      },
    };

    function run(): { data: unknown; error: unknown } {
      calls.push({ table, op, payload });
      const rows = tables[table]!;
      for (const col of options.missingColumns?.[table] ?? []) {
        if (op === "select" && columns.split(",").map((c) => c.trim()).includes(col)) {
          return { data: null, error: { code: "42703", message: `column ${table}.${col} does not exist` } };
        }
        if ((op === "insert" || op === "upsert") && payload && !Array.isArray(payload) && col in payload) {
          return { data: null, error: { code: "PGRST204", message: `Could not find the '${col}' column of '${table}' in the schema cache` } };
        }
      }
      if (op === "delete") {
        const keep = rows.filter((r) => !filters.every((f) => f(r)));
        const removed = rows.length - keep.length;
        rows.splice(0, rows.length, ...keep);
        return { data: null, error: null, count: removed } as { data: unknown; error: unknown };
      }
      if (op === "upsert") {
        rows.push({ created_at: (options.now?.() ?? new Date()).toISOString(), ...(payload as Row) });
        return { data: null, error: null };
      }
      if (op === "insert") {
        const err = options.insertError?.[table];
        if (err) return { data: null, error: err };
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const inserted = list.map((r) => ({ id: `id-${++seq}`, created_at: (options.now?.() ?? new Date()).toISOString(), ...r }));
        rows.push(...inserted);
        return { data: single ? inserted[0] : inserted, error: null };
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of matched) Object.assign(r, payload);
        return { data: matched, error: null };
      }
      return { data: single ? (matched[0] ?? null) : matched, error: null };
    }

    return builder;
  }

  const db = {
    from,
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      calls.push({ table: `rpc:${fn}`, op: "rpc", payload: args });
      const handler = options.rpc?.[fn];
      return handler ? handler(args) : { data: 0, error: null };
    },
  };
  return { db: db as unknown as import("@supabase/supabase-js").SupabaseClient, tables, calls };
}
