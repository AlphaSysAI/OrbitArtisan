import { expect, it } from "vitest";
import { recentConversationMessages } from "./recent-conversation-messages";

it("transmet la correction récente dans l'ordre naturel de lecture", async () => {
  const rows = [{ id: 1, body: "lundi" }, { id: 2, body: "finalement mardi" }, { id: 3, body: "je confirme mardi" }];
  const query = {
    select: () => query,
    eq: () => query,
    order: (field: string, { ascending }: { ascending: boolean }) => {
      if (field === "created_at" && !ascending) rows.reverse();
      return query;
    },
    limit: async (n: number) => ({ data: rows.slice(0, n) }),
  };
  const messages = await recentConversationMessages({ from: () => query } as never, "conversation", 2);
  expect(messages.map((message) => message.body)).toEqual(["finalement mardi", "je confirme mardi"]);
});
