import { describe, expect, it } from "vitest";
import {
  authEmailInputSchema,
  emailOtpInputSchema,
  getAuthCallbackUrl,
  getPostSignUpPath,
  signInInputSchema,
  signUpInputSchema,
} from "./auth-contracts";

describe("authentication contracts", () => {
  it("normalizes email addresses at every entry boundary", () => {
    expect(
      signInInputSchema.parse({
        email: "  Reviewer@Example.com ",
        password: "password",
      }).email,
    ).toBe("reviewer@example.com");
    expect(authEmailInputSchema.parse({ email: " TEAM@EXAMPLE.COM " }).email).toBe(
      "team@example.com",
    );
  });

  it("requires a strong bounded password and matching confirmation", () => {
    expect(
      signUpInputSchema.safeParse({
        displayName: "Arun Reviewer",
        email: "arun@example.com",
        password: "short",
        confirmPassword: "short",
      }).success,
    ).toBe(false);
    expect(
      signUpInputSchema.safeParse({
        displayName: "Arun Reviewer",
        email: "arun@example.com",
        password: "a-secure-passphrase",
        confirmPassword: "different-passphrase",
      }).success,
    ).toBe(false);
  });

  it("accepts only a six-digit email verification code", () => {
    expect(
      emailOtpInputSchema.safeParse({
        email: "reviewer@example.com",
        token: "123456",
      }).success,
    ).toBe(true);
    expect(
      emailOtpInputSchema.safeParse({
        email: "reviewer@example.com",
        token: "12345a",
      }).success,
    ).toBe(false);
  });

  it("builds a fixed same-application confirmation endpoint", () => {
    expect(getAuthCallbackUrl("https://editorial.example.com")).toBe(
      "https://editorial.example.com/auth/confirm",
    );
  });

  it("routes auto-confirmed signups directly to the membership gate", () => {
    expect(getPostSignUpPath("reviewer@example.com", true)).toBe("/pending-access");
    expect(getPostSignUpPath("reviewer+pilot@example.com", false)).toBe(
      "/verify-email?email=reviewer%2Bpilot%40example.com&sent=1",
    );
  });
});
