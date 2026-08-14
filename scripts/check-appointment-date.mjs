/**
 * Vérifie la résolution du jour d'un RDV dicté, sans appeler d'IA.
 * Usage : node scripts/check-appointment-date.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-alias-loader.mjs", pathToFileURL("./scripts/"));

const { resolveAppointmentDate, hasDateHint } = await import("../src/lib/ai/resolve-appointment-when.ts");

const NOW = new Date(2026, 7, 5, 15, 0, 0); // mercredi 5 août 2026

const HISTORY_12_AOUT = [
  "Artisan: Est-ce que j'ai un rendez-vous de prévu le 12 août",
  "Assistant: Oui — 1 rendez-vous le mercredi 12 août :\n  – 10:30 · FLORIAN LAPERTOT — Devis travaux neuf (confirmé)",
];

const cases = [
  {
    name: "le bug signalé : pas de date + date_query hallucinée depuis l'exemple",
    input: {
      message: "OK crée-moi un rendez-vous à 14h pour l'Aperto",
      intentDateQuery: "27 et 28 août",
      historyLines: HISTORY_12_AOUT,
    },
    expect: { dateIso: "2026-08-12", source: "history" },
  },
  {
    name: "date explicite dans le message : elle gagne toujours",
    input: {
      message: "crée un RDV pour Dupont le 13 août à 11h",
      intentDateQuery: "27 et 28 août",
      historyLines: HISTORY_12_AOUT,
    },
    expect: { dateIso: "2026-08-13", source: "message" },
  },
  {
    name: "demain",
    input: { message: "cale un RDV demain à 9h pour Martin", intentDateQuery: "demain" },
    expect: { dateIso: "2026-08-06", source: "message" },
  },
  {
    name: "jour de semaine seul (jeudi → le 6)",
    input: { message: "planifie un rendez-vous jeudi à 14h", intentDateQuery: "jeudi" },
    expect: { dateIso: "2026-08-06", source: "message" },
  },
  {
    name: "jeudi prochain → semaine suivante",
    input: { message: "un RDV jeudi prochain à 8h", intentDateQuery: "jeudi prochain" },
    expect: { dateIso: "2026-08-13", source: "message" },
  },
  {
    name: "mercredi un mercredi → le suivant, pas aujourd'hui",
    input: { message: "un RDV mercredi à 8h" },
    expect: { dateIso: "2026-08-12", source: "message" },
  },
  {
    name: "dans 3 jours",
    input: { message: "prends-moi un RDV dans 3 jours à 10h" },
    expect: { dateIso: "2026-08-08", source: "message" },
  },
  {
    name: "historique ambigu (deux dates) : on ne devine pas",
    input: {
      message: "crée un RDV à 14h",
      intentDateQuery: "27 et 28 août",
      historyLines: ["Artisan: j'ai des RDV les 27 et 28 août ?", "Assistant: Oui, 2 le 27 août et 1 le 28 août."],
    },
    expect: { dateIso: null, source: null },
  },
  {
    name: "aucun contexte : on demande le jour",
    input: { message: "crée un RDV à 14h pour Dupont", intentDateQuery: "27 et 28 août" },
    expect: { dateIso: null, source: null },
  },
  {
    name: "date_query normalisée acceptée car le message parle bien d'un jour",
    input: { message: "un RDV le 20/08 à 16h", intentDateQuery: "20 août" },
    expect: { dateIso: "2026-08-20", source: "message" },
  },
];

let failures = 0;
for (const c of cases) {
  const got = resolveAppointmentDate({ ...c.input, now: NOW });
  const ok = got.dateIso === c.expect.dateIso && got.source === c.expect.source;
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${c.name}\n     attendu ${c.expect.dateIso} (${c.expect.source}) — obtenu ${got.dateIso} (${got.source})`,
  );
}

console.log("\nhasDateHint:");
for (const [text, expected] of [
  ["crée-moi un rendez-vous à 14h pour l'Aperto", false],
  ["crée un RDV le 13 août", true],
  ["un RDV jeudi", true],
  ["un RDV demain", true],
  ["un RDV le 20/08", true],
  ["un RDV pour Dupont", false],
]) {
  const got = hasDateHint(text);
  const ok = got === expected;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} « ${text} » → ${got}`);
}

console.log(failures ? `\n${failures} échec(s)` : "\nTout passe");
process.exit(failures ? 1 : 0);
