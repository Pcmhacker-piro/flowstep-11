import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import logoAsset from "@/assets/logo.png";

const NEXT_STORAGE_KEY = "flowstep:oauth_next";

function safeNext(raw: string | undefined): string | null {
  if (!raw) return null;
  // Only same-origin relative paths.
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign up — Flowstep" },
      { name: "description", content: "Create your Flowstep account or log in to generate production-ready UI in seconds." },
      { property: "og:title", content: "Sign up — Flowstep" },
      { property: "og:description", content: "Create your Flowstep account or log in to generate production-ready UI in seconds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email("Enter a valid email address").max(255, "Email is too long");
const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Password must be 72 characters or fewer");

type Mode = "signup" | "login" | "forgot";
type FieldErrors = { email?: string; password?: string };

function friendlyError(raw: string): string {
  const message = raw.toLowerCase();
  if (message.includes("invalid login credentials")) {
    return "That email and password don't match. Check them and try again.";
  }
  if (message.includes("email not confirmed")) {
    return "Please confirm your email first — check your inbox for the link we sent.";
  }
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "An account with this email already exists. Log in instead.";
  }
  if (message.includes("rate limit") || message.includes("too many")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (message.includes("password")) return raw;
  if (message.includes("failed to fetch") || message.includes("network")) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  return raw || "Something went wrong. Please try again.";
}

function passwordStrength(value: string): { score: number; label: string } {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  const label = score <= 1 ? "Weak" : score <= 3 ? "Good" : "Strong";
  return { score: Math.min(score, 5), label };
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <img src={logoAsset} alt="Flowstep" className="h-7 w-7 rounded-lg" />
      <span className="text-lg font-semibold tracking-tight text-[#0b1220]">flowstep</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const nextPath = safeNext(search.next);
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [updates, setUpdates] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(true);

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const strength = useMemo(() => passwordStrength(password), [password]);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setFieldErrors({});
    setConfirmSent(false);
  }

  function goNext() {
    if (nextPath) {
      window.location.href = nextPath;
      return;
    }
    navigate({ to: "/app", replace: true });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      // Honor a same-origin `next` stashed before Google OAuth returned to /auth.
      if (typeof window !== "undefined") {
        const stashed = safeNext(sessionStorage.getItem(NEXT_STORAGE_KEY) ?? undefined);
        if (stashed) {
          sessionStorage.removeItem(NEXT_STORAGE_KEY);
          window.location.href = stashed;
          return;
        }
      }
      if (nextPath) {
        window.location.href = nextPath;
        return;
      }
      navigate({ to: "/app", replace: true });
    });
  }, [navigate, nextPath]);

  async function handleGoogle() {
    setError(null);
    setNotice(null);
    setGoogleLoading(true);
    if (nextPath && typeof window !== "undefined") {
      sessionStorage.setItem(NEXT_STORAGE_KEY, nextPath);
    }
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw new Error(result.error.message ?? "Google sign-in failed");
      if (result.redirected) return;
      goNext();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      if (/not supported|not enabled|provider/i.test(message)) {
        setGoogleAvailable(false);
        setError("Google sign-in isn't available yet. Please use your email and password.");
      } else {
        setError(friendlyError(message));
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  function validate(): { email: string; password?: string } | null {
    const errors: FieldErrors = {};
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) errors.email = emailResult.error.issues[0].message;

    let parsedPassword: string | undefined;
    if (!isForgot) {
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) errors.password = passwordResult.error.issues[0].message;
      else parsedPassword = passwordResult.data;
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return null;
    return { email: emailResult.success ? emailResult.data : "", password: parsedPassword };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const parsed = validate();
    if (!parsed) return;

    setLoading(true);
    try {
      if (isForgot) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsed.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setNotice(`We sent a password reset link to ${parsed.email}. It expires in one hour.`);
        return;
      }

      if (isSignup) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: parsed.email,
          password: parsed.password!,
          options: {
            emailRedirectTo: nextPath
              ? `${window.location.origin}${nextPath}`
              : `${window.location.origin}/app`,
            data: { marketing_opt_in: updates },
          },
        });
        if (signUpError) throw signUpError;
        // With email confirmation on, there is no session yet — don't pretend they're in.
        if (!data.session) {
          setConfirmSent(true);
          return;
        }
        goNext();
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: parsed.email,
        password: parsed.password!,
      });
      if (signInError) throw signInError;
      goNext();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : ""));
    } finally {
      setLoading(false);
    }
  }

  const heading = isForgot ? "Reset your password" : isSignup ? "Sign up" : "Log in";
  const subline = isForgot
    ? "Enter the email you signed up with and we'll send you a reset link."
    : isSignup
      ? "Start generating production-ready screens in seconds."
      : "Welcome back. Pick up where you left off.";
  const submitLabel = isForgot ? "Send reset link" : isSignup ? "Create account" : "Log in";
  const pendingLabel = isForgot ? "Sending link…" : isSignup ? "Creating account…" : "Logging in…";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7f8fb] to-white">
      <header className="px-6 py-5">
        <Link to="/" aria-label="Back to Flowstep home">
          <Logo />
        </Link>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-6 pt-10 pb-24">
        {confirmSent ? (
          <div className="rounded-2xl border border-black/5 bg-white p-8 text-center shadow-[0_18px_50px_-24px_rgba(11,18,32,0.35)]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#2b6bff]/10 text-[#2b6bff]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[#0b1220]">Confirm your email</h1>
            <p className="mt-2 text-sm leading-relaxed text-[#0b1220]/70">
              We sent a confirmation link to <span className="font-medium text-[#0b1220]">{email}</span>. Click it to
              activate your account, then come back and log in.
            </p>
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="mt-6 w-full rounded-lg bg-[#2b6bff] px-5 py-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1f57df]"
            >
              Back to log in
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-black/5 bg-white p-8 shadow-[0_18px_50px_-24px_rgba(11,18,32,0.35)]">
            <h1 className="text-2xl font-semibold tracking-tight text-[#0b1220]">{heading}</h1>
            <p className="mt-2 text-sm text-[#0b1220]/65">{subline}</p>

            {!isForgot && googleAvailable && (
              <>
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={googleLoading || loading}
                  className="mt-7 flex w-full items-center justify-center gap-3 rounded-lg border border-black/8 bg-white px-4 py-3 text-sm font-medium text-[#0b1220] transition-colors duration-150 hover:bg-[#f4f4f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2b6bff] disabled:opacity-60"
                >
                  {googleLoading ? <Spinner /> : <GoogleIcon />}
                  {googleLoading ? "Opening Google…" : "Continue with Google"}
                </button>

                <div className="my-6 flex items-center gap-3 text-xs text-[#0b1220]/40">
                  <div className="h-px flex-1 bg-black/10" />
                  <span>or continue with email</span>
                  <div className="h-px flex-1 bg-black/10" />
                </div>
              </>
            )}
            {(isForgot || !googleAvailable) && <div className="mt-7" />}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-[#0b1220]">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  value={email}
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  className={`w-full rounded-lg border bg-[#f7f8fb] px-4 py-3 text-sm text-[#0b1220] outline-none transition-colors duration-150 placeholder:text-[#0b1220]/35 focus:border-[#2b6bff] focus:bg-white focus:ring-2 focus:ring-[#2b6bff]/25 ${
                    fieldErrors.email ? "border-red-400" : "border-transparent"
                  }`}
                />
                {fieldErrors.email && (
                  <p id="email-error" className="mt-1.5 text-xs text-red-600">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {!isForgot && (
                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <label htmlFor="password" className="block text-sm font-medium text-[#0b1220]">
                      Password
                    </label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => switchMode("forgot")}
                        className="text-xs font-medium text-[#2b6bff] hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={isSignup ? "At least 8 characters" : "Your password"}
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      value={password}
                      aria-invalid={fieldErrors.password ? true : undefined}
                      aria-describedby={fieldErrors.password ? "password-error" : undefined}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                      }}
                      className={`w-full rounded-lg border bg-[#f7f8fb] px-4 py-3 pr-20 text-sm text-[#0b1220] outline-none transition-colors duration-150 placeholder:text-[#0b1220]/35 focus:border-[#2b6bff] focus:bg-white focus:ring-2 focus:ring-[#2b6bff]/25 ${
                        fieldErrors.password ? "border-red-400" : "border-transparent"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#0b1220]/55 hover:text-[#0b1220]"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p id="password-error" className="mt-1.5 text-xs text-red-600">
                      {fieldErrors.password}
                    </p>
                  )}
                  {isSignup && password.length > 0 && !fieldErrors.password && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex flex-1 gap-1">
                        {[1, 2, 3, 4, 5].map((step) => (
                          <span
                            key={step}
                            className={`h-1 flex-1 rounded-full transition-colors duration-150 ${
                              step <= strength.score
                                ? strength.score <= 1
                                  ? "bg-red-400"
                                  : strength.score <= 3
                                    ? "bg-amber-400"
                                    : "bg-emerald-500"
                                : "bg-black/10"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-[#0b1220]/55">{strength.label}</span>
                    </div>
                  )}
                </div>
              )}

              {isSignup && (
                <label className="flex items-start gap-2 pt-1 text-sm text-[#0b1220]/75">
                  <input
                    type="checkbox"
                    checked={updates}
                    onChange={(e) => setUpdates(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#2b6bff]"
                  />
                  Keep me updated with Flowstep's news and offers
                </label>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                >
                  {error}
                </p>
              )}
              {notice && (
                <p
                  role="status"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"
                >
                  {notice}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || googleLoading}
                className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2b6bff] px-5 py-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1f57df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2b6bff]/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && <Spinner />}
                {loading ? pendingLabel : submitLabel}
              </button>

              {isSignup && (
                <p className="pt-1 text-xs leading-relaxed text-[#0b1220]/50">
                  By creating an account, you acknowledge that you have read, understood, and agree to our{" "}
                  <Link className="underline" to="/terms">Terms of Use</Link> and{" "}
                  <Link className="underline" to="/privacy">Privacy Policy</Link>.
                </p>
              )}
            </form>
          </div>
        )}

        {!confirmSent && (
          <p className="mt-6 text-center text-sm text-[#0b1220]/70">
            {isForgot ? (
              <>
                Remembered it?{" "}
                <button type="button" onClick={() => switchMode("login")} className="font-medium text-[#2b6bff] hover:underline">
                  Back to log in
                </button>
              </>
            ) : isSignup ? (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("login")} className="font-medium text-[#2b6bff] hover:underline">
                  Log in
                </button>
              </>
            ) : (
              <>
                New to Flowstep?{" "}
                <button type="button" onClick={() => switchMode("signup")} className="font-medium text-[#2b6bff] hover:underline">
                  Sign up
                </button>
              </>
            )}
          </p>
        )}
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2 6.5 2.2 2 6.7 2 12.1S6.5 22 12 22c6.9 0 11.5-4.9 11.5-11.7 0-.8-.1-1.4-.2-2H12z" />
    </svg>
  );
}
