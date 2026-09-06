"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CircleAlertIcon, Loader2Icon } from "lucide-react";

import { type SetupAuthStrategy } from "@/lib/bootstrap";
import { dictionaryFor, type Locale } from "@/lib/i18n/messages";
import { authClient } from "@/lib/auth/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SignInCardProps = {
  /** Chosen by the server; the copy itself is resolved in this bundle. */
  locale: Locale;
  organizationName: string;
  authStrategy: SetupAuthStrategy;
  googleAvailable: boolean;
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4.5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.32Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function SignInCard({
  locale,
  organizationName,
  authStrategy,
  googleAvailable,
}: SignInCardProps) {
  const dict = dictionaryFor(locale).auth;
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailAllowed = authStrategy !== "google-first";
  const googleAllowed = authStrategy !== "email-password" && googleAvailable;

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const result = await authClient.signIn.email({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      callbackURL: new URL("/portal", window.location.origin).toString(),
    });

    setPending(false);

    if (result.error) {
      setError(dict.errorBody);
      // Put the cursor back where the correction has to happen.
      emailRef.current?.focus();
      return;
    }

    router.push("/portal");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 text-center">
        <p className="text-xs tracking-[0.28em] text-muted-foreground uppercase">
          {organizationName}
        </p>
        <h1 className="text-3xl leading-tight font-semibold text-balance">
          {dict.title}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground text-balance">
          {dict.subtitle}
        </p>
      </div>

      <div className="public-card rounded-2xl border p-6 shadow-[0_24px_60px_-32px_rgba(16,24,40,0.35)]">
        <div className="flex flex-col gap-5">
          {googleAllowed ? (
            <Button
              size="lg"
              variant={emailAllowed ? "outline" : "default"}
              className="w-full"
              disabled={googlePending}
              onClick={async () => {
                setGooglePending(true);
                await authClient.signIn.social({
                  provider: "google",
                  callbackURL: new URL("/portal", window.location.origin).toString(),
                });
              }}
            >
              {googlePending ? (
                <Loader2Icon className="animate-spin" aria-hidden="true" />
              ) : (
                <GoogleMark />
              )}
              {dict.continueWithGoogle}
            </Button>
          ) : null}

          {googleAllowed && emailAllowed ? (
            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground uppercase">
                {dict.or}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
          ) : null}

          {emailAllowed ? (
            <form action={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="auth-email">{dict.emailLabel}</Label>
                <Input
                  id="auth-email"
                  ref={emailRef}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="auth-password">{dict.passwordLabel}</Label>
                <Input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  required
                />
              </div>

              {error ? (
                <Alert variant="destructive" aria-live="polite">
                  <CircleAlertIcon aria-hidden="true" />
                  <AlertTitle>{dict.errorTitle}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" size="lg" className="w-full" disabled={pending}>
                {pending ? (
                  <Loader2Icon className="animate-spin" aria-hidden="true" />
                ) : null}
                {dict.submit}
              </Button>
            </form>
          ) : (
            <p className="text-center text-sm leading-6 text-muted-foreground">
              {dict.googleOnlyNotice}
            </p>
          )}
        </div>
      </div>

      <p className="text-center text-sm leading-6 text-muted-foreground">
        {dict.applyPrompt}{" "}
        <Link
          href="/join"
          className="font-medium text-foreground underline underline-offset-4"
        >
          {dict.applyLink}
        </Link>
      </p>
    </div>
  );
}
