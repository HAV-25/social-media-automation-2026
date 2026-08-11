import { z } from "zod";

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_PUBLISHABLE_KEY__: string;

const schema = z.object({
  url: z.string().url(),
  key: z.string().min(20),
});

export const reviewerEnvironment = schema.safeParse({
  url: __SUPABASE_URL__,
  key: __SUPABASE_PUBLISHABLE_KEY__,
});
