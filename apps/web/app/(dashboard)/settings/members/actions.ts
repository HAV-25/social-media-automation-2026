"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DEMO_MEMBER_OVERRIDE_PREFIX } from "@/lib/member-access";
import { memberAccessInputSchema } from "@/lib/member-access-core";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function fail(message: string): never {
  redirect(`/settings/members?error=${encodeURIComponent(message)}`);
}

export async function saveMemberAccess(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.organizationRole !== "administrator") {
    fail("Only an organization administrator can manage member access.");
  }

  const assignments = formData.getAll("brandId").map((entry) => {
    const brandId = String(entry);
    return {
      brandId,
      role: String(formData.get(`brandRole:${brandId}`) ?? ""),
    };
  });
  const parsed = memberAccessInputSchema.safeParse({
    organizationId: user.organizationId,
    userId: String(formData.get("userId") ?? ""),
    organizationRole: String(formData.get("organizationRole") ?? ""),
    brandAssignments: assignments,
  });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid member access.");

  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    cookieStore.set(
      `${DEMO_MEMBER_OVERRIDE_PREFIX}${parsed.data.userId}`,
      JSON.stringify({
        organizationRole: parsed.data.organizationRole,
        brandAssignments: parsed.data.brandAssignments,
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      },
    );
    redirect(`/settings/members?saved=${parsed.data.userId}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("manage_organization_member_access", {
    payload: parsed.data,
  });
  if (error) {
    const safeMessages: Record<string, string> = {
      "22023": "The requested member access is invalid.",
      "23514": "The organization must retain at least one administrator.",
      "42501": "You are not authorized to apply this member access.",
      P0002: "The organization member no longer exists.",
    };
    fail(safeMessages[error.code] ?? "The member access change could not be saved.");
  }
  redirect(`/settings/members?saved=${parsed.data.userId}`);
}
