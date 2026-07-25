"use server";

import { redirect } from "next/navigation";
import { emailOtpInputSchema } from "@/lib/auth-contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function verifyEmailCode(formData: FormData) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") redirect("/sign-in");

  const parsed = emailOtpInputSchema.safeParse({
    email: formData.get("email"),
    token: formData.get("token"),
  });
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!parsed.success) {
    redirect(`/verify-email?email=${encodeURIComponent(email)}&error=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "email",
  });
  if (error) {
    redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}&error=invalid`);
  }
  redirect("/pending-access");
}
