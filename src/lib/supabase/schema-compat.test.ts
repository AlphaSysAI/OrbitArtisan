import { describe, expect, it } from "vitest";

import { isMissingSchemaObject } from "./schema-compat";

describe("isMissingSchemaObject", () => {
  it("colonne absente en lecture (message réel PostgreSQL/PostgREST)", () => {
    expect(isMissingSchemaObject({ code: "42703", message: 'column "call_report" does not exist' }, "call_report")).toBe(true);
    expect(isMissingSchemaObject({ code: "42703", message: "column voice_call_intakes.call_report does not exist" }, "call_report")).toBe(true);
  });
  it("colonne absente en écriture, fonction ou table absente du cache PostgREST", () => {
    expect(isMissingSchemaObject({ code: "PGRST204", message: "Could not find the 'call_report' column of 'voice_call_intakes' in the schema cache" }, "call_report")).toBe(true);
    expect(isMissingSchemaObject({ code: "PGRST202", message: "Could not find the function public.voice_book_appointment(...) in the schema cache" }, "voice_book_appointment")).toBe(true);
    expect(isMissingSchemaObject({ code: "PGRST205", message: "Could not find the table 'public.voice_call_sessions' in the schema cache" }, "voice_call_sessions")).toBe(true);
  });
  it("ne masque pas une autre colonne absente ni une autre erreur", () => {
    expect(isMissingSchemaObject({ code: "42703", message: 'column "is_urgent" does not exist' }, "call_report")).toBe(false);
    expect(isMissingSchemaObject({ code: "42501", message: "permission denied for table voice_call_intakes (call_report)" }, "call_report")).toBe(false);
    expect(isMissingSchemaObject({ code: "57014", message: "statement timeout" }, "call_report")).toBe(false);
    expect(isMissingSchemaObject(null, "call_report")).toBe(false);
  });
});
