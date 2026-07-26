import "server-only";
import { organizationRoleSchema, type OrganizationRole } from "@content-engine/contracts";
import { cookies } from "next/headers";
import { z } from "zod";
import { demoUser } from "./demo-data";
import { demoMemberOverrideSchema } from "./member-access-core";
import { createSupabaseServerClient } from "./supabase/server";

export const DEMO_MEMBER_OVERRIDE_PREFIX = "demo-member-access-";
const DEMO_TEAMMATE_ID = "40000000-0000-4000-8000-000000000099";

export type OrganizationMemberAccess = {
  userId: string;
  displayName: string;
  email: string | null;
  organizationRole: OrganizationRole;
  joinedAt: string;
  brandAssignments: Array<{ brandId: string; role: OrganizationRole }>;
};

const membershipRowSchema = z.object({
  user_id: z.uuid(),
  role: organizationRoleSchema,
  created_at: z.iso.datetime({ offset: true }),
});
const profileRowSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string().min(1),
  email: z.string().email().nullable(),
});
const brandMembershipRowSchema = z.object({
  user_id: z.uuid(),
  brand_id: z.uuid(),
  role: organizationRoleSchema,
});

function parseDemoOverride(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = demoMemberOverrideSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getOrganizationMemberAccess(
  organizationId: string,
  brandIds: string[],
): Promise<OrganizationMemberAccess[]> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    const defaults: OrganizationMemberAccess[] = [
      {
        userId: demoUser.id,
        displayName: demoUser.displayName,
        email: demoUser.email,
        organizationRole: "administrator",
        joinedAt: "2026-07-01T09:00:00.000Z",
        brandAssignments: brandIds.map((brandId) => ({ brandId, role: "administrator" })),
      },
      {
        userId: DEMO_TEAMMATE_ID,
        displayName: "Demo teammate",
        email: "reviewer@example.internal",
        organizationRole: "reviewer",
        joinedAt: "2026-07-02T09:00:00.000Z",
        brandAssignments: brandIds.map((brandId) => ({ brandId, role: "reviewer" })),
      },
    ];
    return defaults.map((member) => {
      const override = parseDemoOverride(
        cookieStore.get(`${DEMO_MEMBER_OVERRIDE_PREFIX}${member.userId}`)?.value,
      );
      return override
        ? {
            ...member,
            organizationRole: override.organizationRole,
            brandAssignments: override.brandAssignments,
          }
        : member;
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data: membershipRows, error: membershipError } = await supabase
    .from("organization_members")
    .select("user_id,role,created_at")
    .eq("organization_id", organizationId)
    .order("created_at");
  if (membershipError) {
    throw new Error(`Unable to load organization members: ${membershipError.message}`);
  }

  const memberships = z.array(membershipRowSchema).parse(membershipRows ?? []);
  const userIds = memberships.map((membership) => membership.user_id);
  if (!userIds.length) return [];

  const [{ data: profileRows, error: profileError }, { data: brandRows, error: brandError }] =
    await Promise.all([
      supabase.from("profiles").select("user_id,display_name,email").in("user_id", userIds),
      supabase
        .from("brand_members")
        .select("user_id,brand_id,role")
        .in("user_id", userIds)
        .in("brand_id", brandIds),
    ]);
  if (profileError) throw new Error(`Unable to load member profiles: ${profileError.message}`);
  if (brandError) throw new Error(`Unable to load member brand access: ${brandError.message}`);

  const profiles = new Map(
    z
      .array(profileRowSchema)
      .parse(profileRows ?? [])
      .map((profile) => [profile.user_id, profile]),
  );
  const brandAssignments = z.array(brandMembershipRowSchema).parse(brandRows ?? []);

  return memberships.map((membership) => {
    const profile = profiles.get(membership.user_id);
    return {
      userId: membership.user_id,
      displayName: profile?.display_name ?? "Authorized user",
      email: profile?.email ?? null,
      organizationRole: membership.role,
      joinedAt: membership.created_at,
      brandAssignments: brandAssignments
        .filter((assignment) => assignment.user_id === membership.user_id)
        .map((assignment) => ({
          brandId: assignment.brand_id,
          role: assignment.role,
        })),
    };
  });
}
