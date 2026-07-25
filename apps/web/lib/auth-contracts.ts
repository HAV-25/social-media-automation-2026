import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(12).max(128);

export const signInInputSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export const signUpInputSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1).max(128),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.password !== input.confirmPassword) {
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

export const emailOtpInputSchema = z
  .object({
    email: emailSchema,
    token: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
  })
  .strict();

export const authEmailInputSchema = z.object({ email: emailSchema }).strict();

export function getAuthCallbackUrl(appUrl: string) {
  const url = new URL("/auth/confirm", appUrl);
  return url.toString();
}
