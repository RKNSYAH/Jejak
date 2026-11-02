import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedClaims } from "../engine/controller/userServerController";
import { authDestination } from "../engine/lib/authDestination";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Masuk atau daftar | Jejak",
  description: "Masuk ke Jejak atau buat akun baru.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const mode = params.mode === "signup" || params.mode === "reset" || params.mode === "forgot" ? params.mode : "login";
  const next = authDestination(typeof params.next === "string" ? params.next : null);
  const claims = await getAuthenticatedClaims().catch(() => null);

  if (mode === "reset") {
    if (!claims) redirect("/login?mode=forgot&error=reset");
  } else if (claims) {
    redirect(next);
  }

  return <LoginForm initialMode={mode} next={next} error={typeof params.error === "string" ? params.error : null} signedOut={params.status === "signed-out"} />;
}
