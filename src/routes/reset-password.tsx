import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/logo.png";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Flowstep" },
      { name: "description", content: "Choose a new password for your Flowstep account." },
      { property: "og:title", content: "Set a new password — Flowstep" },
      { property: "og:description", content: "Choose a new password for your Flowstep account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Password must be 72 characters or fewer");

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

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [fieldError, setFieldError] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);

  useEffect(() => {
    // A recovery link either delivers a session directly or arrives as a hash the
    // client exchanges — wait for either before showing the form.
    let settled = false;
    const finish = (hasSession: boolean) => {
      if (settled) return;
      settled = true;
      setReady(hasSession);
      setChecking(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish(true);
      else setTimeout(() => finish(false), 1200);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errors: { password?: string; confirm?: string } = {};
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) errors.password = parsed.error.issues[0].message;
    if (confirm !== password) errors.confirm = "Passwords don't match";
    setFieldError(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
      setTimeout(() => navigate({ to: "/app", replace: true }), 1600);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setError(
        /expired|invalid/i.test(raw)
          ? "This reset link has expired. Request a new one from the log in page."
          : raw || "We couldn't update your password. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7f8fb] to-white">
      <header className="px-6 py-5">
        <Link to="/" className="flex items-center gap-2" aria-label="Back to Flowstep home">
          <img src={logoAsset} alt="Flowstep" className="h-7 w-7 rounded-lg" />
          <span className="text-lg font-semibold tracking-tight text-[#0b1220]">flowstep</span>
        </Link>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-6 pt-10 pb-24">
        <div className="rounded-2xl border border-black/5 bg-white p-8 shadow-[0_18px_50px_-24px_rgba(11,18,32,0.35)]">
          {checking ? (
            <div className="flex flex-col items-center gap-3 py-8 text-sm text-[#0b1220]/60">
              <Spinner />
              Checking your reset link…
            </div>
          ) : done ? (
            <div className="py-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="m4 12.5 5 5L20 6.5" strokeLinecap="round" />
                </svg>
              </div>
              <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[#0b1220]">Password updated</h1>
              <p className="mt-2 text-sm text-[#0b1220]/70">Taking you to your workspace…</p>
            </div>
          ) : !ready ? (
            <div className="py-2 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-[#0b1220]">Link no longer valid</h1>
              <p className="mt-2 text-sm leading-relaxed text-[#0b1220]/70">
                This password reset link is missing or has expired. Request a fresh one and we'll email it right away.
              </p>
              <Link
                to="/auth"
                className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#2b6bff] px-5 py-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1f57df]"
              >
                Back to log in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-[#0b1220]">Set a new password</h1>
              <p className="mt-2 text-sm text-[#0b1220]/65">
                Choose a password you haven't used before. You'll stay signed in on this device.
              </p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
                <div>
                  <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-[#0b1220]">
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={show ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      value={password}
                      aria-invalid={fieldError.password ? true : undefined}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldError.password) setFieldError((p) => ({ ...p, password: undefined }));
                      }}
                      className={`w-full rounded-lg border bg-[#f7f8fb] px-4 py-3 pr-20 text-sm text-[#0b1220] outline-none transition-colors duration-150 placeholder:text-[#0b1220]/35 focus:border-[#2b6bff] focus:bg-white focus:ring-2 focus:ring-[#2b6bff]/25 ${
                        fieldError.password ? "border-red-400" : "border-transparent"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShow((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#0b1220]/55 hover:text-[#0b1220]"
                    >
                      {show ? "Hide" : "Show"}
                    </button>
                  </div>
                  {fieldError.password && <p className="mt-1.5 text-xs text-red-600">{fieldError.password}</p>}
                  {password.length > 0 && !fieldError.password && (
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

                <div>
                  <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-[#0b1220]">
                    Confirm password
                  </label>
                  <input
                    id="confirm-password"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    value={confirm}
                    aria-invalid={fieldError.confirm ? true : undefined}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      if (fieldError.confirm) setFieldError((p) => ({ ...p, confirm: undefined }));
                    }}
                    className={`w-full rounded-lg border bg-[#f7f8fb] px-4 py-3 text-sm text-[#0b1220] outline-none transition-colors duration-150 placeholder:text-[#0b1220]/35 focus:border-[#2b6bff] focus:bg-white focus:ring-2 focus:ring-[#2b6bff]/25 ${
                      fieldError.confirm ? "border-red-400" : "border-transparent"
                    }`}
                  />
                  {fieldError.confirm && <p className="mt-1.5 text-xs text-red-600">{fieldError.confirm}</p>}
                </div>

                {error && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2b6bff] px-5 py-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#1f57df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2b6bff]/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving && <Spinner />}
                  {saving ? "Updating password…" : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
