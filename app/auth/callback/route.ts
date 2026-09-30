import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "../../engine/lib/server";
import { authDestination, signupDestination } from "../../engine/lib/authDestination";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const destination = type === "recovery" || next === "/login?mode=reset"
    ? "/login?mode=reset"
    : type === "signup" || type === "email" ? signupDestination(next) : authDestination(next);

  if (tokenHash && type && ["signup", "email", "recovery", "invite", "magiclink", "email_change"].includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(destination, request.url));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, request.url));
  }

  const retry = type === "recovery" || next === "/login?mode=reset" ? "/login?mode=forgot&error=callback" : "/login?error=callback";
  return NextResponse.redirect(new URL(retry, request.url));
}
