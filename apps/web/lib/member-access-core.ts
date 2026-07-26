import { organizationRoleSchema } from "@content-engine/contracts";
import { z } from "zod";

export const brandAssignmentSchema = z
  .object({
    brandId: z.uuid(),
    role: organizationRoleSchema,
  })
  .strict();

export const memberAccessInputSchema = z
  .object({
    organizationId: z.uuid(),
    userId: z.uuid(),
    organizationRole: organizationRoleSchema,
    brandAssignments: z.array(brandAssignmentSchema).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    const uniqueBrands = new Set(value.brandAssignments.map((assignment) => assignment.brandId));
    if (uniqueBrands.size !== value.brandAssignments.length) {
      context.addIssue({
        code: "custom",
        message: "Each brand may be assigned only once.",
        path: ["brandAssignments"],
      });
    }
  });

export const demoMemberOverrideSchema = memberAccessInputSchema.pick({
  organizationRole: true,
  brandAssignments: true,
});

export type MemberAccessInput = z.infer<typeof memberAccessInputSchema>;
