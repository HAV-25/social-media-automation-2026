"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  brandArchivePolicyInputSchema,
  brandArchivePolicySchema,
} from "@/lib/brand-archive-policy-core";
import { DEMO_ARCHIVE_POLICY_PREFIX } from "@/lib/brand-archive-policy";
import { canManageBrand } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function fail(message: string): never {
  redirect(`/settings/archive?error=${encodeURIComponent(message)}`);
}

export async function saveBrandArchivePolicy(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!canManageBrand(user.role)) fail("Editor access is required to change archive controls.");

  const parsed = brandArchivePolicyInputSchema.safeParse({
    brandId: String(formData.get("brandId") ?? ""),
    inboxWindowHours: formData.get("inboxWindowHours"),
    resurfaceWindowHours: formData.get("resurfaceWindowHours"),
  });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid archive policy.");

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    cookieStore.set(
      `${DEMO_ARCHIVE_POLICY_PREFIX}${parsed.data.brandId}`,
      JSON.stringify(
        brandArchivePolicySchema.parse({
          inboxWindowHours: parsed.data.inboxWindowHours,
          resurfaceWindowHours: parsed.data.resurfaceWindowHours,
          archiveMode: "non_destructive",
        }),
      ),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      },
    );
    redirect("/settings/archive?saved=true");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("brand_profiles")
    .update({
      rss_inbox_window_hours: parsed.data.inboxWindowHours,
      rss_resurface_window_hours: parsed.data.resurfaceWindowHours,
    })
    .eq("brand_id", parsed.data.brandId)
    .select("brand_id")
    .maybeSingle();
  if (error || !data) fail("The archive policy could not be saved for this brand.");
  redirect("/settings/archive?saved=true");
}
