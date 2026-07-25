import { cookies } from "next/headers";
import { demoUser } from "./demo-data";
import { createSupabaseServerClient } from "./supabase/server";

export async function getCurrentUser() {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  if (demoMode) {
    const cookieStore = await cookies();
    return cookieStore.get("content-engine-demo-session")?.value === "signed-in" ? demoUser : null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const [{ data: profile }, { data: memberships }, { data: brandMemberships }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("organization_members")
      .select("organization_id,role")
      .eq("user_id", user.id)
      .limit(1),
    supabase.from("brand_members").select("role").eq("user_id", user.id),
  ]);
  const membership = memberships?.[0];
  if (!membership) return null;
  const roleOrder = ["viewer", "reviewer", "editor", "administrator"] as const;
  const role = [membership.role, ...(brandMemberships ?? []).map((item) => item.role)].reduce(
    (highest, candidate) =>
      roleOrder.indexOf(candidate) > roleOrder.indexOf(highest) ? candidate : highest,
    "viewer" as (typeof roleOrder)[number],
  );

  return {
    id: user.id,
    organizationId: membership.organization_id,
    organizationRole: membership.role,
    email: user.email ?? "",
    displayName:
      profile?.display_name ?? user.user_metadata.name ?? user.email ?? "Authorized user",
    role,
  };
}
