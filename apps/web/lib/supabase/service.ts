import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnvSchema } from "@content-engine/contracts";

export function createSupabaseServiceClient() {
  const env = serverEnvSchema.parse(process.env);
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error("Supabase service client requested without server-only configuration");
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
