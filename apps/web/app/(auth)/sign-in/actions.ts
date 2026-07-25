"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { signInInputSchema } from "@/lib/auth-contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    const cookieStore = await cookies();
    cookieStore.set("content-engine-demo-session", "signed-in", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    redirect("/");
  }

  const parsed = signInInputSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/sign-in?error=invalid");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect("/sign-in?error=invalid");
  redirect("/");
}
