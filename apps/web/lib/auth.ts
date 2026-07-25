import { cookies } from "next/headers";
import { demoUser } from "./demo-data";
import { createSupabaseServerClient } from "./supabase/server";

export type AuthState =
  | { kind: "signed_out" }
  | { kind: "pending_access"; identity: { id: string; email: string; displayName: string } }
  | { kind: "authorized"; user: typeof demoUser };

export async function getAuthState(): Promise<AuthState> {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  if (demoMode) {
    const cookieStore = await cookies();
    return cookieStore.get("content-engine-demo-session")?.value === "signed-in"
      ? { kind: "authorized", user: demoUser }
      : { kind: "signed_out" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { kind: "signed_out" };

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
  const displayName =
    profile?.display_name ??
    (typeof user.user_metadata.name === "string" ? user.user_metadata.name : undefined) ??
    user.email ??
    "Verified user";
  if (!membership) {
    return {
      kind: "pending_access",
      identity: {
        id: user.id,
        email: user.email ?? "",
        displayName,
      },
    };
  }
  const roleOrder = ["viewer", "reviewer", "editor", "administrator"] as const;
  const role = [membership.role, ...(brandMemberships ?? []).map((item) => item.role)].reduce(
    (highest, candidate) =>
      roleOrder.indexOf(candidate) > roleOrder.indexOf(highest) ? candidate : highest,
    "viewer" as (typeof roleOrder)[number],
  );

  return {
    kind: "authorized",
    user: {
      id: user.id,
      organizationId: membership.organization_id,
      organizationRole: membership.role,
      email: user.email ?? "",
      displayName,
      role,
    },
  };
}

export async function getCurrentUser() {
  const state = await getAuthState();
  return state.kind === "authorized" ? state.user : null;
}
