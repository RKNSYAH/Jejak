"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronLeft, Eye, EyeOff } from "lucide-react";
import { loginUser, loginWithGoogle, registerUser, requestPasswordReset, updatePassword } from "../engine/controller/userController";
import { signupDestination } from "../engine/lib/authDestination";
import { setRememberPreference } from "../engine/lib/client";
import BrandLogo from "../components/BrandLogo";

type Mode = "login" | "signup" | "forgot" | "reset";

const accessModes = [["login", "Masuk"], ["signup", "Daftar"]] as const;

export default function LoginForm({
  initialMode,
  next,
  error,
  signedOut,
}: {
  initialMode: Mode;
  next: string; // already checked with authDestination by the page
  error: string | null;
  signedOut: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(error === "callback" ? "Tautan masuk tidak valid atau sudah kedaluwarsa. Coba lagi." : error === "reset" ? "Tautan pengaturan ulang tidak berlaku. Minta tautan baru." : signedOut ? "Kamu sudah keluar dari akun." : "");
  const destination = next;

  const isSignup = mode === "signup";
  const isLogin = mode === "login";
  const isPasswordMode = mode !== "forgot";
  const passwordChecks = {
    length: password.length >= 8,
    letter: /\p{Ll}/u.test(password),
    number: /\d/.test(password),
  };
  const passwordValid = Object.values(passwordChecks).every(Boolean);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage("");
    setPassword("");
    setShowPassword(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    if ((isSignup || mode === "reset") && !passwordValid) {
      setMessage("Kata sandi harus minimal 8 karakter, dengan huruf kecil dan angka.");
      return;
    }

    setPending(true);
    setMessage("");

    try {
      if (isLogin) {
        setRememberPreference(remember);
        const { error } = await loginUser(email, password);
        if (error) throw error;
        router.replace(destination);
        router.refresh();
      } else if (isSignup) {
        setRememberPreference(true);
        const callback = new URL("/auth/callback", window.location.origin);
        callback.searchParams.set("next", signupDestination(destination));
        const { data, error } = await registerUser(email, password, "", callback.toString());
        if (error) throw error;
        if (data.session) {
          router.replace(signupDestination(destination));
          router.refresh();
        } else {
          setMessage("Periksa emailmu untuk mengonfirmasi akun, lalu lanjutkan masuk.");
        }
      } else if (mode === "forgot") {
        const { error } = await requestPasswordReset(email, window.location.origin);
        if (error) throw error;
        setMessage("Jika email terdaftar, tautan untuk mengatur ulang kata sandi akan dikirim.");
      } else {
        const { error } = await updatePassword(password);
        if (error) throw error;
        router.replace("/map?passwordUpdated=1");
        router.refresh();
      }
    } catch (error) {
      if (isLogin) setRememberPreference(true);
      setMessage(error instanceof Error ? error.message : "Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setPending(false);
    }
  }

  async function handleGoogle() {
    if (pending) return;
    setPending(true);
    setMessage("");
    try {
      setRememberPreference(isSignup || remember);
      const oauthDestination = isSignup ? signupDestination(destination) : destination;
      const { error } = await loginWithGoogle(window.location.origin, oauthDestination);
      if (error) throw error;
    } catch (error) {
      setRememberPreference(true);
      setMessage(error instanceof Error ? error.message : "Tidak dapat masuk dengan Google. Coba lagi.");
      setPending(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh w-full shrink-0 flex-col bg-base-100 font-body text-ink lg:flex-row lg:justify-end" data-hci-region="login-page">
      <header className="flex min-h-20 w-full shrink-0 items-center border-b border-rule px-4 pt-[env(safe-area-inset-top)] lg:hidden" data-hci-region="auth-header">
        <Link href="/" aria-label="Beranda" className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <ChevronLeft aria-hidden="true" className="size-6" strokeWidth={1.75} />
        </Link>
        <BrandLogo large border={false} />
      </header>
      <div className="hidden lg:absolute lg:left-8 lg:top-8 lg:block" data-hci-region="auth-brand">
        <BrandLogo large />
      </div>
      <div className="flex w-full flex-1 flex-col bg-base-100 lg:max-w-xl lg:border-l lg:border-rule lg:shadow-overlay">
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 lg:min-h-dvh lg:pb-8">
          <header className="hidden pt-12 lg:flex">
            <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
              Beranda
            </Link>
          </header>

          <div className="mt-8">
            {(isLogin || isSignup) && (
              <nav aria-label="Pilih cara mengakses akun" className="flex min-h-12 rounded-xl border border-rule p-1" data-hci-region="login-mode">
                {accessModes.map(([value, label]) => (
                  <button key={value} type="button" aria-current={mode === value ? "page" : undefined} onClick={() => changeMode(value)} className={`btn min-h-11 flex-1 rounded-lg border-0 text-sm font-semibold shadow-none ${mode === value ? "bg-primary text-primary-content hover:bg-primary/90" : "bg-transparent text-ink hover:bg-primary-tint"}`}>
                    {label}
                  </button>
                ))}
              </nav>
            )}

            <section aria-labelledby="auth-title" className="mt-[12px] md:mt-5" data-hci-region="login-form">
              <h1 id="auth-title" className="font-sans text-2xl font-bold leading-tight tracking-[-0.02em] md:text-3xl">
                {isLogin ? "Masuk ke Jejak" : isSignup ? "Buat akun Jejak" : mode === "forgot" ? "Lupa kata sandi?" : "Atur kata sandi baru"}
              </h1>

              {isSignup && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs leading-relaxed text-ink-muted">
                  <span className="badge badge-primary badge-soft min-h-6 rounded-full border-primary/20 px-3 text-xs font-semibold">Paket Gratis</span>
                  Bisa ditingkatkan kapan saja.
                  <Link href="/pricing" className="font-semibold text-primary underline underline-offset-1">Lihat paket</Link>
                </p>
              )}
              {mode === "forgot" && <p className="mt-2 text-sm text-ink-muted">Masukkan emailmu untuk menerima tautan pengaturan ulang.</p>}
              {mode === "reset" && <p className="mt-2 text-sm text-ink-muted">Buat kata sandi baru untuk akunmu.</p>}

              <form method="post" onSubmit={handleSubmit} className="mt-5">
                {mode !== "reset" && (
                  <div>
                    <label htmlFor="email" className="mb-2 block text-sm font-semibold">Email</label>
                    <input id="email" name="email" type="email" required autoComplete="username" enterKeyHint="next" placeholder="nama@email.com" value={email} onChange={(event) => setEmail(event.target.value)} className="input min-h-12 w-full rounded-lg border-rule bg-transparent px-4 text-base text-ink placeholder:text-ink-muted focus:border-primary focus:outline-primary" />
                  </div>
                )}

                {isPasswordMode && (
                  <div className={mode === "reset" ? "" : "mt-5"}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor={isLogin ? "current-password" : "new-password"} className="text-sm font-semibold">Kata sandi</label>
                      {isLogin && <button type="button" onClick={() => changeMode("forgot")} className="min-h-11 text-sm font-semibold text-primary underline underline-offset-1 focus-visible:outline-2 focus-visible:outline-primary">Lupa kata sandi?</button>}
                    </div>
                    <div className="input relative flex min-h-12 w-full items-center rounded-lg border-rule bg-transparent p-0 focus-within:border-primary focus-within:outline-primary">
                      <input id={isLogin ? "current-password" : "new-password"} name="password" type={showPassword ? "text" : "password"} required autoComplete={isLogin ? "current-password" : "new-password"} aria-describedby={isLogin ? undefined : "password-hints"} enterKeyHint="done" placeholder={isSignup ? "••••••••" : "Masukkan kata sandi"} value={password} onChange={(event) => setPassword(event.target.value)} className="h-full min-w-0 flex-1 bg-transparent pl-4 pr-1 text-base text-ink placeholder:text-ink-muted focus:outline-none" />
                      <button type="button" aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="flex min-h-11 w-12 shrink-0 items-center justify-center text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                        {showPassword ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
                      </button>
                    </div>
                    {(isSignup || mode === "reset") && (
                      <div id="password-hints" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
                        {([["length", "Minimal 8 karakter"], ["letter", "Huruf kecil"], ["number", "Satu angka"]] as const).map(([check, label]) => (
                          <span key={check} className="inline-flex items-center gap-[3px]">
                            {passwordChecks[check] ? <Check aria-hidden="true" className="size-3 text-primary" /> : <span aria-hidden="true" className="size-2 rounded-full border border-ink-muted" />}
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {isLogin && (
                  <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                    <input name="remember" type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="checkbox size-5 rounded-none border-ink-muted" />
                    Tetap masuk di perangkat ini
                  </label>
                )}
                {isSignup && (
                  <div className="mt-5 space-y-2">
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <input name="terms" type="checkbox" required className="checkbox size-5 shrink-0 rounded-none border-ink-muted" />
                      <span>Saya setuju dengan <Link href="/terms" className="font-semibold text-primary underline">Syarat layanan</Link> dan <Link href="/privacy" className="font-semibold text-primary underline">Kebijakan privasi</Link> Jejak.</span>
                    </label>
                  </div>
                )}

                {message && <p role="status" aria-live="polite" className="mt-3 text-sm leading-relaxed text-error wrap-break-word">{message}</p>}

                <button type="submit" disabled={pending} className="btn btn-primary mt-5 min-h-12 w-full rounded-xl border-0 text-sm font-semibold shadow-none">
                  {pending ? "Memproses…" : isLogin ? "Masuk" : isSignup ? <span className="inline-flex items-center gap-2">Buat akun dan lanjut <ArrowRight aria-hidden="true" className="size-4" /></span> : mode === "forgot" ? "Kirim tautan" : "Simpan kata sandi"}
                </button>
              </form>

              {(isLogin || isSignup) && (
                <>
                  <div className="my-4 flex items-center gap-4 text-xs text-ink-muted"><span className="h-px flex-1 bg-rule" /><span>atau</span><span className="h-px flex-1 bg-rule" /></div>
                  <button type="button" onClick={handleGoogle} disabled={pending} className="btn btn-outline min-h-12 w-full rounded-xl border-ink bg-transparent text-sm font-semibold text-ink shadow-none hover:bg-ink hover:text-on-ink">
                    {isLogin ? "Masuk dengan Google" : "Daftar dengan Google"}
                  </button>
                  <p className="mt-4 text-sm text-ink-muted">
                    {isLogin ? "Belum punya akun? " : "Sudah punya akun? "}
                    <button type="button" onClick={() => changeMode(isLogin ? "signup" : "login")} className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary">{isLogin ? "Daftar gratis" : "Masuk"}</button>
                  </p>
                </>
              )}
              {mode === "forgot" && <button type="button" onClick={() => changeMode("login")} className="mt-4 min-h-11 text-sm font-semibold text-primary underline">Kembali ke Masuk</button>}
              {mode === "reset" && <Link href="/map" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Kembali ke peta</Link>}
            </section>
          </div>

          <footer className="mt-auto pt-7 text-xs leading-relaxed text-ink-muted md:pt-6">
            {isSignup ? (
              <p>Informasi pribadimu tidak akan dibagikan ke pihak ketiga.</p>
            ) : (
              <p>Butuh bantuan masuk? <a href="mailto:dukungan@jejak.id" className="font-semibold text-primary underline">Hubungi dukungan</a></p>
            )}
          </footer>
        </div>
      </div>
    </main>
  );
}
