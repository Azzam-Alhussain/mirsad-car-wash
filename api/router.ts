import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { correctEventSize, getSettings, listWashEvents, updateSettings } from "./queries/wash";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  events: createRouter({
    list: publicQuery.query(() => listWashEvents()),
    correctSize: publicQuery.input(z.object({
      id: z.number().int().positive(),
      size: z.enum(["small", "medium", "large"]),
    })).mutation(async ({ input }) => {
      const rows = await correctEventSize(input.id, input.size);
      if (!rows[0]) throw new Error("Wash event not found");
      return rows[0];
    }),
  }),
  settings: createRouter({
    get: publicQuery.query(() => getSettings()),
    update: publicQuery.input(z.object({
      prices: z.object({ small: z.number().nonnegative(), medium: z.number().nonnegative(), large: z.number().nonnegative() }),
      variableCosts: z.object({ small: z.number().nonnegative(), medium: z.number().nonnegative(), large: z.number().nonnegative() }),
      fixedDaily: z.number().nonnegative(), laborDaily: z.number().nonnegative(),
    })).mutation(({ input }) => updateSettings(input)),
  }),
});

export type AppRouter = typeof appRouter;
