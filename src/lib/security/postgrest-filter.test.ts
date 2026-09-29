import { describe, expect, it } from "vitest";

import { ilikeOrPattern } from "./postgrest-filter";

describe("ilikeOrPattern", () => {
  it("retire la syntaxe PostgREST", () => {
    expect(ilikeOrPattern("x,user_id.neq.abc")).toBe("%x user id neq abc%");
    expect(ilikeOrPattern('a),and(b.eq."c"')).toBe("%a and b eq c%");
  });
  it("garde une recherche normale", () => {
    expect(ilikeOrPattern("  placo BA13 ")).toBe("%placo BA13%");
  });
});
