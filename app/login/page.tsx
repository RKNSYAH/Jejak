import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Masuk atau daftar | Jejak",
  description: "Masuk ke Jejak atau buat akun baru.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const mode = params.mode === "signup" || params.mode === "reset" ? params.mode : "login";

  return <LoginForm initialMode={mode} callbackError={params.error === "callback"} />;
}
