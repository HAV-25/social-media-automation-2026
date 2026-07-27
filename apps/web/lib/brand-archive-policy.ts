import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  brandArchivePolicySchema,
  DEFAULT_BRAND_ARCHIVE_POLICY,
  type BrandArchivePolicy,
} from "./brand-archive-policy-core";
import { createSupabaseServerClient } from "./supabase/server";

export const DEMO_ARCHIVE_POLICY_PREFIX = "brand-archive-policy-demo-";

const policyRowSchema = z.object({
  rss_inbox_window_hours: z.number().int(),
  rss_resurface_window_hours: z.number().int(),
});

export async function getBrandArchivePolicy(brandId: string): Promise<BrandArchivePolicy> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    const encoded = cookieStore.get(`${DEMO_ARCHIVE_POLICY_PREFIX}${brandId}`)?.value;
    if (encoded) {
      try {
        const parsed = brandArchivePolicySchema.safeParse(JSON.parse(encoded));
        if (parsed.success) return parsed.data;
      } catch {
        // Ignore invalid demo state and return the production default.
      }
    }
    return DEFAULT_BRAND_ARCHIVE_POLICY;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("brand_profiles")
    .select("rss_inbox_window_hours,rss_resurface_window_hours")
    .eq("brand_id", brandId)
    .single();
  if (error) throw new Error("Unable to load the brand archive policy.");
  const row = policyRowSchema.parse(data);
  return brandArchivePolicySchema.parse({
    inboxWindowHours: row.rss_inbox_window_hours,
    resurfaceWindowHours: row.rss_resurface_window_hours,
    archiveMode: "non_destructive",
  });
}
