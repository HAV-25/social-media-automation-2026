"use server";

import { redirect } from "next/navigation";
import { getAuthCallbackUrl, signUpInputSchema } from "@/lib/auth-contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signUp(formData: FormData) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") redirect("/sign-in");

  const parsed = signUpInputSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) redirect("/sign-up?error=invalid");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { displayName, email, password } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: displayName },
      emailRedirectTo: getAuthCallbackUrl(appUrl),
    },
  });

  if (error) redirect("/sign-up?error=unavailable");
  redirect(`/verify-email?email=${encodeURIComponent(email)}&sent=1`);
}
