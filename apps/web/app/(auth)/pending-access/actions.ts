"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOutPendingUser() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/sign-in");
}
