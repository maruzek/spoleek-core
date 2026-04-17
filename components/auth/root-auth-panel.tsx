"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleAlertIcon, LockKeyholeIcon, MailIcon } from "lucide-react";

import { type SetupAuthStrategy } from "@/lib/bootstrap";
import { authClient } from "@/lib/auth/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type RootAuthPanelProps = {
  authStrategy: SetupAuthStrategy;
  googleAvailable: boolean;
};

export function RootAuthPanel({
  authStrategy,
  googleAvailable,
}: RootAuthPanelProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailAllowed = authStrategy !== "google-first";
  const googleAllowed = authStrategy !== "email-password" && googleAvailable;

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);

    const payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      callbackURL: "/portal",
    };

    const result = await authClient.signIn.email({
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(218,255,231,0.85),_rgba(250,248,240,0.9)_42%,_rgba(242,235,223,0.95)_100%)]">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
        <header className="max-w-3xl">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            Login
          </Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
            Sign in to the organization workspace.
          </h1>
          <p className="mt-4 text-base leading-8 text-muted-foreground">
            The setup wizard is finished. This page is now the dedicated authentication entry for
            the deployment.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="bg-card/95">
            <CardHeader>
              <CardTitle>Configured sign-in strategy</CardTitle>
              <CardDescription>
                The setup wizard decided which sign-in options should be presented here.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
              <div className="flex flex-wrap gap-2">
                <Badge>{authStrategy}</Badge>
                {googleAllowed ? <Badge variant="secondary">Google available</Badge> : null}
              </div>
              <p>Email/password forms appear only when the chosen setup path allows them.</p>
              <p>Google sign-in only appears when it was selected during setup and the provider env vars are valid.</p>
              {!googleAllowed && authStrategy !== "email-password" ? (
                <Alert variant="destructive">
                  <CircleAlertIcon />
                  <AlertTitle>Google is configured in setup, but unavailable now.</AlertTitle>
                  <AlertDescription>
                    Recheck the Google env vars if you expect Google sign-in to be visible.
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card className="bg-card/95">
            <CardHeader>
              <CardTitle>Welcome back</CardTitle>
              <CardDescription>
                Authenticate with the method chosen during first-run setup.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {emailAllowed ? null : (
                <Alert>
                  <LockKeyholeIcon />
                  <AlertTitle>Google-first deployment</AlertTitle>
                  <AlertDescription>
                    This setup path expects members to enter through Google sign-in.
                  </AlertDescription>
                </Alert>
              )}

              {emailAllowed ? (
                <form action={handleSubmit} className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="auth-email">Email</Label>
                    <Input id="auth-email" name="email" type="email" required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="auth-password">Password</Label>
                    <Input id="auth-password" name="password" type="password" required />
                  </div>

                  {error ? (
                    <Alert variant="destructive">
                      <CircleAlertIcon />
                      <AlertTitle>Authentication failed</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  ) : null}

                  <Button type="submit" disabled={pending}>
                    {pending ? "Working..." : "Sign in"}
                  </Button>
                </form>
              ) : null}

              {emailAllowed ? (
                <Alert>
                  <MailIcon />
                  <AlertTitle>Invite-only account setup</AlertTitle>
                  <AlertDescription>
                    New member accounts are created only after an administrator approves the join
                    request and sends the activation email. If you are waiting for approval or need
                    a fresh invite, contact your organization administrator.
                  </AlertDescription>
                </Alert>
              ) : null}

              {googleAllowed ? (
                <>
                  {emailAllowed ? <Separator /> : null}
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await authClient.signIn.social({
                        provider: "google",
                        callbackURL: "/portal",
                      });
                    }}
                  >
                    Continue with Google
                  </Button>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
