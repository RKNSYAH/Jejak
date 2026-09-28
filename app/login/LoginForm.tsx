"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronLeft, Eye, EyeOff } from "lucide-react";
import { loginUser, loginWithGoogle, registerUser, requestPasswordReset, updatePassword } from "../engine/controller/userController";

type Mode = "login" | "signup" | "forgot" | "reset";

export default function LoginForm({
  initialMode,
  callbackError,
}: {
  initialMode: "login" | "signup" | "reset";
  callbackError: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(callbackError ? "Tautan masuk tidak valid atau sudah kedaluwarsa. Coba lagi." : "");

  const isSignup = mode === "signup";
  const isLogin = mode === "login";
  const isPasswordMode = isLogin || isSignup || mode === "reset";
  const passwordChecks = {
    length: password.length >= 8,
    letter: /\p{Ll}/u.test(password),
    number: /\d/.test(password),
  };

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage("");
    setPassword("");
    setShowPassword(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    if (isSignup && !Object.values(passwordChecks).every(Boolean)) {
      setMessage("Kata sandi harus minimal 8 karakter, dengan huruf kecil dan angka.");
      return;
    }

    setPending(true);
    setMessage("");

    try {
      if (isLogin) {
        const { error } = await loginUser(email, password);
        if (error) throw error;
        router.push("/map");
      } else if (isSignup) {
        const callback = new URL("/auth/callback", window.location.origin);
        callback.searchParams.set("next", "/map?welcome=1");
        const { data, error } = await registerUser(email, password, "", callback.toString());
        if (error) throw error;
        if (data.session) {
          router.push("/map?welcome=1");
        } else {
          setMessage("Periksa emailmu untuk mengonfirmasi akun, lalu lanjutkan masuk.");
        }
      } else if (mode === "forgot") {
        const { error } = await requestPasswordReset(email, window.location.origin);
        if (error) throw error;
        setMessage("Jika email terdaftar, tautan untuk mengatur ulang kata sandi akan dikirim.");
      } else {
        if (!Object.values(passwordChecks).every(Boolean)) {
          setMessage("Kata sandi harus minimal 8 karakter, dengan huruf kecil dan angka.");
          return;
        }
        const { error } = await updatePassword(password);
        if (error) throw error;
        changeMode("login");
        setMessage("Kata sandi berhasil diperbarui. Silakan masuk.");
      }
    } catch (error) {
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
      const next = isSignup ? "/map?welcome=1" : "/map";
      const { error } = await loginWithGoogle(window.location.origin, next);
      if (error) throw error;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tidak dapat masuk dengan Google. Coba lagi.");
      setPending(false);
    }
  }

  return (
    <main className="flex h-dvh w-full flex-1 justify-end overflow-hidden bg-base-100 font-body text-ink" data-hci-region="login-page">
      <div className="h-dvh w-full overflow-y-auto overscroll-contain bg-base-100 md:max-w-xl md:border-l md:border-rule md:shadow-overlay">
      <div className={`relative mx-auto flex min-h-dvh w-full max-w-[242px] flex-col pb-4 md:left-0 md:max-w-[400px] md:pb-8 ${isLogin ? "-left-2" : "-left-0.5"}`}>
        <header className="flex items-center justify-between pl-[3px] pt-[27px] md:pl-0 md:pt-12">
          <Link href="/" className="inline-flex min-h-5 items-center gap-1 text-[8px] font-semibold hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:min-h-11 md:gap-2 md:text-sm">
            <ChevronLeft aria-hidden="true" className="size-3 md:size-4" strokeWidth={1.75} />
            Beranda
          </Link>
          {isSignup && <span className="text-[8px] text-ink-muted md:text-xs">Langkah 1 dari 5 · Akun</span>}
        </header>

        <div className={`${isLogin ? "mt-[45px]" : "mt-[21px]"} md:mt-8`}>
          {(isLogin || isSignup) && (
            <nav aria-label="Pilih cara mengakses akun" className="flex h-[30px] rounded-[8px] border border-rule p-[2px] md:h-12 md:rounded-xl md:p-1" data-hci-region="login-mode">
              <button type="button" aria-current={isLogin ? "page" : undefined} onClick={() => changeMode("login")} className={`btn min-h-0 h-full flex-1 rounded-[5px] border-0 text-[8px] font-semibold shadow-none md:rounded-lg md:text-sm ${isLogin ? "bg-primary text-primary-content hover:bg-primary/90" : "bg-transparent text-ink hover:bg-primary-tint"}`}>
                Masuk
              </button>
              <button type="button" aria-current={isSignup ? "page" : undefined} onClick={() => changeMode("signup")} className={`btn min-h-0 h-full flex-1 rounded-[5px] border-0 text-[8px] font-semibold shadow-none md:rounded-lg md:text-sm ${isSignup ? "bg-primary text-primary-content hover:bg-primary/90" : "bg-transparent text-ink hover:bg-primary-tint"}`}>
                Daftar
              </button>
            </nav>
          )}

          <section aria-labelledby="auth-title" className="mt-[12px] md:mt-5" data-hci-region="login-form">
            <h1 id="auth-title" className="font-sans text-[18px] font-bold leading-[22px] tracking-[-0.02em] md:text-3xl md:leading-tight">
              {isLogin ? "Masuk ke Jejak" : isSignup ? "Buat akun Jejak" : mode === "forgot" ? "Lupa kata sandi?" : "Atur kata sandi baru"}
            </h1>

            {isLogin && <p className="mt-1 text-[8px] leading-[13px] text-ink-muted md:mt-2 md:text-sm">Buka lagi profil, area tersimpan, dan paketmu.</p>}
            {isSignup && (
              <p className="mt-[5px] flex items-center gap-1 text-[7px] leading-[15px] text-ink-muted md:mt-3 md:gap-2 md:text-xs">
                <span className="badge badge-primary badge-soft h-[15px] rounded-full border-primary/20 px-[6px] text-[7px] font-semibold md:h-6 md:px-3 md:text-xs">Paket Gratis</span>
                Bisa ditingkatkan kapan saja.
                <Link href="/pricing" className="font-semibold text-primary underline underline-offset-1">Lihat paket</Link>
              </p>
            )}
            {mode === "forgot" && <p className="mt-2 text-[8px] text-ink-muted md:text-sm">Masukkan emailmu untuk menerima tautan pengaturan ulang.</p>}
            {mode === "reset" && <p className="mt-2 text-[8px] text-ink-muted md:text-sm">Buat kata sandi baru untuk akunmu.</p>}

            <form method="post" onSubmit={handleSubmit} className={`${isSignup ? "mt-[15px]" : isLogin ? "mt-[16px]" : "mt-[14px]"} md:mt-5`}>
              {mode !== "reset" && (
                <div>
                  <label htmlFor="email" className="mb-[4px] block text-[8px] font-semibold leading-[10px] md:mb-2 md:text-sm md:leading-normal">Email</label>
                  <input id="email" name="email" type="email" required autoComplete="username" enterKeyHint="next" placeholder={isSignup ? "nama@email.com" : "raka@email.com"} value={email} onChange={(event) => setEmail(event.target.value)} className="input h-[29px] min-h-0 w-full rounded-[5px] border-rule bg-transparent px-[9px] text-[8px] text-ink placeholder:text-ink-muted focus:border-primary focus:outline-primary md:h-12 md:rounded-lg md:px-4 md:text-base" />
                </div>
              )}

              {isPasswordMode && (
                <div className={mode === "reset" ? "" : `${isLogin ? "mt-[4px]" : "mt-[9px]"} md:mt-5`}>
                  <div className="mb-[4px] flex items-center justify-between md:mb-2">
                    <label htmlFor={isLogin ? "current-password" : "new-password"} className="text-[8px] font-semibold leading-[10px] md:text-sm md:leading-normal">Kata sandi</label>
                    {isLogin && <button type="button" onClick={() => changeMode("forgot")} className="min-h-4 text-[7px] font-semibold text-primary underline underline-offset-1 focus-visible:outline-2 focus-visible:outline-primary md:text-xs">Lupa kata sandi?</button>}
                  </div>
                  <div className="input relative flex h-[29px] min-h-0 w-full items-center rounded-[5px] border-rule bg-transparent p-0 focus-within:border-primary focus-within:outline-primary md:h-12 md:rounded-lg">
                    <input id={isLogin ? "current-password" : "new-password"} name="password" type={showPassword ? "text" : "password"} required autoComplete={isLogin ? "current-password" : "new-password"} aria-describedby={isLogin ? undefined : "password-hints"} enterKeyHint="done" placeholder={isSignup ? "••••••••" : "Masukkan kata sandi"} value={password} onChange={(event) => setPassword(event.target.value)} className="h-full min-w-0 flex-1 bg-transparent pl-[9px] pr-1 text-[8px] text-ink placeholder:text-ink-muted focus:outline-none md:pl-4 md:text-base" />
                    <button type="button" aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="flex h-full w-7 shrink-0 items-center justify-center text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:w-12">
                      {showPassword ? <EyeOff aria-hidden="true" className="size-[11px] md:size-5" /> : <Eye aria-hidden="true" className="size-[11px] md:size-5" />}
                    </button>
                  </div>
                  {(isSignup || mode === "reset") && (
                    <div id="password-hints" className="mt-[5px] flex flex-wrap items-center gap-x-[9px] gap-y-1 text-[7px] text-ink-muted md:mt-3 md:gap-x-4 md:text-xs">
                      {([ ["length", "Minimal 8 karakter"], ["letter", "Huruf kecil"], ["number", "Satu angka"] ] as const).map(([check, label]) => (
                        <span key={check} className="inline-flex items-center gap-[3px]">
                          {passwordChecks[check] ? <Check aria-hidden="true" className="size-[8px] text-primary md:size-3" /> : <span aria-hidden="true" className="size-[6px] rounded-full border border-ink-muted md:size-2" />}
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isLogin && (
                <label className="mt-[6px] flex min-h-[16px] cursor-pointer items-center gap-[6px] text-[7px] md:mt-3 md:min-h-8 md:gap-3 md:text-sm">
                  <input name="remember" type="checkbox" className="checkbox checkbox-xs size-[10px] rounded-none border-ink-muted md:size-4" />
                  Tetap masuk di perangkat ini
                </label>
              )}

              {isSignup && (
                <div className="mt-[10px] space-y-[5px] md:mt-5 md:space-y-2">
                  <label className="flex min-h-[15px] items-center gap-[6px] text-[7px] md:min-h-9 md:gap-3 md:text-sm">
                    <input name="terms" type="checkbox" required className="checkbox checkbox-xs size-[10px] rounded-none border-ink-muted md:size-4" />
                    <span>Saya setuju dengan <Link href="/terms" className="font-semibold text-primary underline">Syarat layanan</Link> dan <Link href="/privacy" className="font-semibold text-primary underline">Kebijakan privasi</Link> Jejak.</span>
                  </label>
                  <label className="flex min-h-[15px] items-center gap-[6px] text-[7px] md:min-h-9 md:gap-3 md:text-sm">
                    <input name="updates" type="checkbox" className="checkbox checkbox-xs size-[10px] rounded-none border-ink-muted md:size-4" />
                    Kirimi saya kabar saat ada kota atau data baru. Opsional.
                  </label>
                </div>
              )}

              {message && <p role="status" aria-live="polite" className="mt-3 text-[8px] leading-relaxed text-ink md:text-sm">{message}</p>}

              <button type="submit" disabled={pending} className="btn btn-primary mt-[13px] h-[28px] min-h-0 w-full rounded-[6px] border-0 text-[8px] font-semibold shadow-none md:mt-4 md:h-12 md:rounded-xl md:text-sm">
                {pending ? "Memproses…" : isLogin ? "Masuk" : isSignup ? <span className="inline-flex items-center gap-2">Buat akun dan lanjut <ArrowRight aria-hidden="true" className="size-[9px] md:size-4" /></span> : mode === "forgot" ? "Kirim tautan" : "Simpan kata sandi"}
              </button>
            </form>

            {(isLogin || isSignup) && (
              <>
                <div className="my-[14px] flex items-center gap-2 text-[8px] leading-[10px] text-ink-muted md:my-4 md:gap-4 md:text-xs"><span className="h-px flex-1 bg-rule" /><span>atau</span><span className="h-px flex-1 bg-rule" /></div>
                <button type="button" onClick={handleGoogle} disabled={pending} className="btn btn-outline h-[28px] min-h-0 w-full rounded-[6px] border-ink bg-transparent text-[8px] font-semibold text-ink shadow-none hover:bg-ink hover:text-on-ink md:h-12 md:rounded-xl md:text-sm">
                  {isLogin ? "Masuk dengan Google" : "Daftar dengan Google"}
                </button>
                <p className="mt-[13px] text-[8px] text-ink-muted md:mt-4 md:text-sm">
                  {isLogin ? "Belum punya akun? " : "Sudah punya akun? "}
                  <button type="button" onClick={() => changeMode(isLogin ? "signup" : "login")} className="font-semibold text-primary underline underline-offset-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary">{isLogin ? "Daftar gratis" : "Masuk"}</button>
                </p>
              </>
            )}
            {(mode === "forgot" || mode === "reset") && <button type="button" onClick={() => changeMode("login")} className="mt-4 text-[8px] font-semibold text-primary underline md:text-sm">Kembali ke Masuk</button>}
          </section>
        </div>

        <footer className="mt-auto pt-7 text-[7px] leading-[11px] text-ink-muted md:pt-6 md:text-xs md:leading-relaxed">
          {isSignup ? (
            <p>Kami tidak akan pernah membagikan informasi pribadi Anda dengan pihak ketiga.</p>
          ) : (
            <p>Butuh bantuan masuk? <a href="mailto:dukungan@jejak.id" className="font-semibold text-primary underline">Hubungi dukungan</a></p>
          )}
        </footer>
      </div>
      </div>
    </main>
  );
}
