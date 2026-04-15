"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

export function AuthPanel({ isGoogleEnabled }: { isGoogleEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? ""),
      callbackURL: "/portal",
    };

    const result =
      mode === "sign-up"
        ? await authClient.signUp.email(payload)
        : await authClient.signIn.email({
            email: payload.email,
            password: payload.password,
            callbackURL: "/portal",
          });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Authentication failed.");
      return;
    }

    router.push("/portal");
    router.refresh();
  }

  async function handleGoogleSignIn() {
    setPending(true);
    setError(null);

    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/portal",
    });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Google sign-in failed.");
    }
  }

  return (
    <section className="grid gap-6 rounded-4xl border border-slate-950/10 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
      <div className="flex gap-2 rounded-full bg-slate-100 p-1">
        {(["sign-in", "sign-up"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={cn(
              "flex-1 rounded-full px-4 py-2 text-sm font-medium transition",
              mode === value
                ? "bg-white text-slate-950 shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            )}
            onClick={() => setMode(value)}
          >
            {value === "sign-in" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>

      <form action={handleSubmit} className="grid gap-4">
        {mode === "sign-up" ? (
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>Full name</span>
            <input
              name="name"
              required
              className="h-11 rounded-2xl border border-slate-300 px-4 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            />
          </label>
        ) : null}
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          <span>Email</span>
          <input
            name="email"
            type="email"
            required
            className="h-11 rounded-2xl border border-slate-300 px-4 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">
          <span>Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="h-11 rounded-2xl border border-slate-300 px-4 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          />
        </label>

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending}>
          {pending
            ? "Working..."
            : mode === "sign-in"
              ? "Sign in to Spoleek"
              : "Create account"}
        </Button>
      </form>

      {isGoogleEnabled ? (
        <div className="grid gap-3">
          <div className="h-px bg-slate-200" />
          <Button type="button" variant="outline" size="lg" onClick={handleGoogleSignIn}>
            Continue with Google
          </Button>
        </div>
      ) : null}
    </section>
  );
}
