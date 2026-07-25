import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedEmailOtpTypes = new Set<EmailOtpType>(["email", "signup"]);

export async function GET(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const requestedType = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await createSupabaseServerClient();

  if (tokenHash && requestedType && allowedEmailOtpTypes.has(requestedType as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: requestedType as EmailOtpType,
    });
    if (!error) return NextResponse.redirect(new URL("/pending-access", request.url));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/pending-access", request.url));
  }

  return NextResponse.redirect(new URL("/verify-email?error=invalid", request.url));
}
