"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { demoBrands } from "@/lib/demo-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function switchBrand(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  if (demoMode) {
    if (!demoBrands.some((brand) => brand.id === brandId)) return;
  } else {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("brands").select("id").eq("id", brandId).maybeSingle();
    if (!data) return;
  }

  const cookieStore = await cookies();
  cookieStore.set("active-brand", brandId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function signOut() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  const cookieStore = await cookies();
  cookieStore.delete("content-engine-demo-session");
  cookieStore.delete("active-brand");
  redirect("/sign-in");
}
