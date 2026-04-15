"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  CheckIcon,
  CircleAlertIcon,
  CloudCogIcon,
  DatabaseZapIcon,
  HardDriveDownloadIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
} from "lucide-react";

import {
  authStrategyLabels,
  deploymentTrackLabels,
  type SetupAuthStrategy,
  type SetupDeploymentTrack,
  type SetupStep,
} from "@/lib/bootstrap";
import { authClient } from "@/lib/auth/client";
import {
  advanceSetupEnvironmentAction,
  claimSetupSessionAdminAction,
  createBootstrapOrganizationAction,
  createSetupEmailAdminAction,
  resetSetupWizardAction,
  saveSetupIntentAction,
  validateSetupEnvironmentAction,
} from "@/server/actions/bootstrap";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type SetupWizardProps = {
  currentStep: SetupStep;
  state: {
    deploymentTrack?: SetupDeploymentTrack;
    authStrategy?: SetupAuthStrategy;
    adminEmail?: string;
  };
  envReadiness: {
    canAdvance: boolean;
    issues: Array<{ key: string; message: string; severity: "error" | "warning" }>;
    requiredKeys: string[];
    databaseConnectionOk: boolean;
  } | null;
  instructions: {
    deploymentLabel: string;
    authLabel: string;
    requiredKeys: string[];
    deployment: { title: string; command: string; details: string[] };
    envSnippet: string;
  } | null;
  viewer: {
    email: string;
    name: string;
  } | null;
  googleAvailable: boolean;
  databaseIssue: string | null;
};

const deploymentOptions: Array<{
  value: SetupDeploymentTrack;
  title: string;
  description: string;
}> = [
  {
    value: "local-docker",
    title: "Local Docker",
    description: "For local development with the bundled Postgres and Adminer stack.",
  },
  {
    value: "vps-docker",
    title: "VPS Docker",
    description: "For self-hosted production deployments on your own server.",
  },
  {
    value: "vercel-neon",
    title: "Vercel + Neon",
    description: "For a hosted deployment using serverless Postgres and managed env configuration.",
  },
];

const authOptions: Array<{
  value: SetupAuthStrategy;
  title: string;
  description: string;
}> = [
  {
    value: "email-password",
    title: "Email and password only",
    description: "The simplest bootstrap path with no Google provider setup.",
  },
  {
    value: "email-password-google",
    title: "Email/password + Google",
    description: "Allow password auth and add Google as a secondary sign-in path.",
  },
  {
    value: "google-first",
    title: "Google-first",
    description: "Use Google during bootstrap and make it the primary setup flow.",
  },
];

const stepIndex: Record<SetupStep, number> = {
  intent: 1,
  environment: 2,
  readiness: 3,
  admin: 4,
  organization: 5,
};

export function SetupWizard({
  currentStep,
  state,
  envReadiness,
  instructions,
  viewer,
  googleAvailable,
  databaseIssue,
}: SetupWizardProps) {
  const router = useRouter();
  const [deploymentTrack, setDeploymentTrack] = useState<SetupDeploymentTrack | undefined>(
    state.deploymentTrack,
  );
  const [authStrategy, setAuthStrategy] = useState<SetupAuthStrategy | undefined>(
    state.authStrategy,
  );

  const saveIntent = useAction(saveSetupIntentAction, {
    onSuccess() {
      router.refresh();
    },
  });
  const advanceGuidance = useAction(advanceSetupEnvironmentAction, {
    onSuccess() {
      router.refresh();
    },
  });
  const validateReadiness = useAction(validateSetupEnvironmentAction, {
    onSuccess() {
      router.refresh();
    },
  });
  const createEmailAdmin = useAction(createSetupEmailAdminAction, {
    onSuccess() {
      router.refresh();
    },
  });
  const claimAdmin = useAction(claimSetupSessionAdminAction, {
    onSuccess() {
      router.refresh();
    },
  });
  const createOrg = useAction(createBootstrapOrganizationAction, {
    onSuccess() {
      router.push("/");
      router.refresh();
    },
  });
  const resetWizard = useAction(resetSetupWizardAction, {
    onSuccess() {
      router.refresh();
    },
  });

  const readinessResult = validateReadiness.result.data?.readiness ?? envReadiness;
  const activeStep = stepIndex[currentStep];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(218,255,231,0.85),_rgba(250,248,240,0.9)_42%,_rgba(242,235,223,0.95)_100%)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              First-run setup
            </Badge>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
              Configure Spoleek before the rest of the app unlocks.
            </h1>
            <p className="mt-4 text-base leading-8 text-muted-foreground">
              This wizard is strict on purpose. It guides deployment, auth, first-admin creation,
              and organization bootstrap in the right order so `/` can safely become the login
              page afterward.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => resetWizard.execute({})}>
              Start over
            </Button>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="bg-card/95">
            <CardHeader>
              <CardTitle>Setup progress</CardTitle>
              <CardDescription>
                The app only advances when the current step is valid.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {[
                {
                  step: "intent" as const,
                  title: "Choose setup path",
                  icon: HardDriveDownloadIcon,
                },
                {
                  step: "environment" as const,
                  title: "Follow tailored env guidance",
                  icon: CloudCogIcon,
                },
                {
                  step: "readiness" as const,
                  title: "Validate readiness",
                  icon: DatabaseZapIcon,
                },
                {
                  step: "admin" as const,
                  title: "Create first admin",
                  icon: KeyRoundIcon,
                },
                {
                  step: "organization" as const,
                  title: "Create organization",
                  icon: ShieldCheckIcon,
                },
              ].map(({ step, title, icon: Icon }) => {
                const index = stepIndex[step];
                const done = index < activeStep;
                const current = index === activeStep;

                return (
                  <div
                    key={step}
                    className="flex items-start gap-3 rounded-xl border border-border/80 bg-background/70 px-4 py-4"
                  >
                    <div className="flex size-10 items-center justify-center rounded-full border border-border bg-secondary">
                      {done ? <CheckIcon className="size-4" /> : <Icon className="size-4" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{title}</p>
                        {current ? <Badge>Current</Badge> : null}
                        {done ? <Badge variant="secondary">Done</Badge> : null}
                      </div>
                      {step === "intent" && state.deploymentTrack && state.authStrategy ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {deploymentTrackLabels[state.deploymentTrack]} +{" "}
                          {authStrategyLabels[state.authStrategy]}
                        </p>
                      ) : null}
                      {step === "admin" && state.adminEmail ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {state.adminEmail}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            {databaseIssue ? (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>Database access is currently blocked.</AlertTitle>
                <AlertDescription>
                  {databaseIssue} The setup wizard can still guide environment fixes, but
                  readiness cannot pass until the database is reachable.
                </AlertDescription>
              </Alert>
            ) : null}

            {currentStep === "intent" ? (
              <Card className="bg-card/95">
                <CardHeader>
                  <CardTitle>Step 1 · Choose your setup path</CardTitle>
                  <CardDescription>
                    These choices determine the instructions and env requirements shown next.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-8">
                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Deployment track</p>
                      <p className="text-sm text-muted-foreground">
                        Pick the infrastructure path you are setting up right now.
                      </p>
                    </div>
                    <ToggleGroup
                      type="single"
                      orientation="vertical"
                      className="grid w-full gap-3"
                      value={deploymentTrack}
                      onValueChange={(value) =>
                        setDeploymentTrack((value as SetupDeploymentTrack) || undefined)
                      }
                    >
                      {deploymentOptions.map((option) => (
                        <ToggleGroupItem
                          key={option.value}
                          value={option.value}
                          variant="outline"
                          className="h-auto w-full items-start justify-start rounded-2xl px-4 py-4 text-left"
                        >
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{option.title}</span>
                            <span className="text-sm text-muted-foreground">
                              {option.description}
                            </span>
                          </div>
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Authentication strategy</p>
                      <p className="text-sm text-muted-foreground">
                        Decide how the app should guide first-run authentication setup.
                      </p>
                    </div>
                    <ToggleGroup
                      type="single"
                      orientation="vertical"
                      className="grid w-full gap-3"
                      value={authStrategy}
                      onValueChange={(value) =>
                        setAuthStrategy((value as SetupAuthStrategy) || undefined)
                      }
                    >
                      {authOptions.map((option) => (
                        <ToggleGroupItem
                          key={option.value}
                          value={option.value}
                          variant="outline"
                          className="h-auto w-full items-start justify-start rounded-2xl px-4 py-4 text-left"
                        >
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{option.title}</span>
                            <span className="text-sm text-muted-foreground">
                              {option.description}
                            </span>
                          </div>
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                </CardContent>
                <CardFooter className="justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    You can restart this step later if you choose the wrong track.
                  </p>
                  <Button
                    onClick={() => {
                      if (!deploymentTrack || !authStrategy) {
                        return;
                      }

                      saveIntent.execute({
                        deploymentTrack,
                        authStrategy,
                      });
                    }}
                    disabled={!deploymentTrack || !authStrategy || saveIntent.isPending}
                  >
                    Continue to env guidance
                  </Button>
                </CardFooter>
              </Card>
            ) : null}

            {currentStep === "environment" && instructions ? (
              <Card className="bg-card/95">
                <CardHeader>
                  <CardTitle>Step 2 · Follow the tailored environment guide</CardTitle>
                  <CardDescription>
                    Your choices now narrow the required `.env` values and infrastructure steps.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <div className="flex flex-wrap gap-2">
                    <Badge>{instructions.deploymentLabel}</Badge>
                    <Badge variant="secondary">{instructions.authLabel}</Badge>
                  </div>

                  <Alert>
                    <LockKeyholeIcon />
                    <AlertTitle>{instructions.deployment.title}</AlertTitle>
                    <AlertDescription>
                      <p className="font-medium">{instructions.deployment.command}</p>
                      <ul className="mt-3 flex flex-col gap-2">
                        {instructions.deployment.details.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-4">
                    <div>
                      <p className="text-sm font-medium">Required env keys for this path</p>
                      <p className="text-sm text-muted-foreground">
                        Only these values will be enforced in the readiness step.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {instructions.requiredKeys.map((key) => (
                        <Badge key={key} variant="outline">
                          {key}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <p className="text-sm font-medium">Suggested `.env` shape</p>
                    <Textarea
                      readOnly
                      value={instructions.envSnippet}
                      className="min-h-72 font-mono text-xs"
                    />
                  </div>
                </CardContent>
                <CardFooter className="justify-between gap-4">
                  <Button variant="outline" onClick={() => resetWizard.execute({})}>
                    Change setup path
                  </Button>
                  <Button
                    onClick={() => advanceGuidance.execute({})}
                    disabled={advanceGuidance.isPending}
                  >
                    I updated the environment
                  </Button>
                </CardFooter>
              </Card>
            ) : null}

            {currentStep === "readiness" && instructions ? (
              <Card className="bg-card/95">
                <CardHeader>
                  <CardTitle>Step 3 · Validate readiness</CardTitle>
                  <CardDescription>
                    Spoleek checks only the env vars and provider requirements needed for your
                    chosen setup path.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <div className="grid gap-3">
                    {instructions.requiredKeys.map((key) => {
                      const relatedIssue = readinessResult?.issues.find((issue) => issue.key === key);
                      const healthy = !relatedIssue;

                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between rounded-xl border border-border/80 bg-background/70 px-4 py-3"
                        >
                          <span className="font-medium">{key}</span>
                          <Badge variant={healthy ? "secondary" : "destructive"}>
                            {healthy ? "Ready" : "Needs attention"}
                          </Badge>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background/70 px-4 py-3">
                      <span className="font-medium">Database connection</span>
                      <Badge
                        variant={
                          readinessResult?.databaseConnectionOk ? "secondary" : "destructive"
                        }
                      >
                        {readinessResult?.databaseConnectionOk ? "Reachable" : "Blocked"}
                      </Badge>
                    </div>
                  </div>

                  {readinessResult?.issues.length ? (
                    <Alert variant="destructive">
                      <CircleAlertIcon />
                      <AlertTitle>Readiness still has blockers.</AlertTitle>
                      <AlertDescription>
                        <ul className="mt-2 flex flex-col gap-2">
                          {readinessResult.issues.map((issue) => (
                            <li key={`${issue.key}-${issue.message}`}>
                              <strong>{issue.key}:</strong> {issue.message}
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
                <CardFooter className="justify-between gap-4">
                  <Button variant="outline" onClick={() => resetWizard.execute({})}>
                    Start over
                  </Button>
                  <Button
                    onClick={() => validateReadiness.execute({})}
                    disabled={validateReadiness.isPending}
                  >
                    Run readiness check
                  </Button>
                </CardFooter>
              </Card>
            ) : null}

            {currentStep === "admin" ? (
              <Card className="bg-card/95">
                <CardHeader>
                  <CardTitle>Step 4 · Create the first admin account</CardTitle>
                  <CardDescription>
                    This account will own the first organization and unlock the post-setup login
                    flow.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  {viewer ? (
                    <Alert>
                      <ShieldCheckIcon />
                      <AlertTitle>Signed in during setup</AlertTitle>
                      <AlertDescription>
                        <p>
                          Current session: <strong>{viewer.email}</strong>
                        </p>
                        <p className="mt-2">
                          Use this account as the first admin if it is the one you want to keep.
                        </p>
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {state.authStrategy !== "google-first" ? (
                    <div className="grid gap-4 rounded-2xl border border-border/80 bg-background/70 p-4">
                      <p className="text-sm font-medium">Create admin with email and password</p>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="setup-admin-name">Full name</Label>
                          <Input id="setup-admin-name" name="name" form="setup-admin-form" />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="setup-admin-email">Email</Label>
                          <Input
                            id="setup-admin-email"
                            name="email"
                            type="email"
                            form="setup-admin-form"
                          />
                        </div>
                        <div className="grid gap-2 md:col-span-2">
                          <Label htmlFor="setup-admin-password">Password</Label>
                          <Input
                            id="setup-admin-password"
                            name="password"
                            type="password"
                            form="setup-admin-form"
                          />
                        </div>
                      </div>
                      <form
                        id="setup-admin-form"
                        action={async (formData) => {
                          await createEmailAdmin.executeAsync({
                            name: String(formData.get("name") ?? ""),
                            email: String(formData.get("email") ?? ""),
                            password: String(formData.get("password") ?? ""),
                          });
                        }}
                        className="flex justify-end"
                      >
                        <Button type="submit" disabled={createEmailAdmin.isPending}>
                          Create first admin
                        </Button>
                      </form>
                    </div>
                  ) : null}

                  {state.authStrategy !== "email-password" ? (
                    <div className="grid gap-4 rounded-2xl border border-border/80 bg-background/70 p-4">
                      <p className="text-sm font-medium">Use Google during setup</p>
                      <p className="text-sm text-muted-foreground">
                        {googleAvailable
                          ? "Google is available for this setup path. Sign in, then claim the current session as the first admin."
                          : "Google was selected in setup, but the current env still does not expose both Google credentials."}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          disabled={!googleAvailable}
                          onClick={async () => {
                            await authClient.signIn.social({
                              provider: "google",
                              callbackURL: "/setup",
                            });
                          }}
                        >
                          Continue with Google
                        </Button>
                        <Button
                          disabled={!viewer || claimAdmin.isPending}
                          onClick={() => claimAdmin.execute({})}
                        >
                          Use current session as first admin
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {createEmailAdmin.result.serverError ? (
                    <Alert variant="destructive">
                      <CircleAlertIcon />
                      <AlertTitle>Admin creation failed</AlertTitle>
                      <AlertDescription>{createEmailAdmin.result.serverError}</AlertDescription>
                    </Alert>
                  ) : null}
                  {claimAdmin.result.serverError ? (
                    <Alert variant="destructive">
                      <CircleAlertIcon />
                      <AlertTitle>Could not claim the current session</AlertTitle>
                      <AlertDescription>{claimAdmin.result.serverError}</AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {currentStep === "organization" ? (
              <Card className="bg-card/95">
                <CardHeader>
                  <CardTitle>Step 5 · Create the organization</CardTitle>
                  <CardDescription>
                    This final step writes the first organization, marks setup complete, and makes
                    `/` the dedicated login page.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <Alert>
                    <ShieldCheckIcon />
                    <AlertTitle>First admin</AlertTitle>
                    <AlertDescription>
                      {state.adminEmail ? (
                        <span>{state.adminEmail} will be assigned as the initial org admin.</span>
                      ) : (
                        <span>Finish the admin step before continuing.</span>
                      )}
                    </AlertDescription>
                  </Alert>

                  <form
                    id="setup-org-form"
                    action={async (formData) => {
                      await createOrg.executeAsync({
                        organizationName: String(formData.get("organizationName") ?? ""),
                        organizationSlug: String(formData.get("organizationSlug") ?? ""),
                        legalName: String(formData.get("legalName") ?? ""),
                        primaryEmail: String(formData.get("primaryEmail") ?? ""),
                        website: String(formData.get("website") ?? ""),
                      });
                    }}
                    className="grid gap-4"
                  >
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="organization-name">Organization name</Label>
                        <Input id="organization-name" name="organizationName" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="organization-slug">Organization slug</Label>
                        <Input id="organization-slug" name="organizationSlug" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="legal-name">Legal entity name</Label>
                        <Input id="legal-name" name="legalName" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="primary-email">Primary email</Label>
                        <Input id="primary-email" name="primaryEmail" type="email" />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="website">Website</Label>
                      <Input id="website" name="website" placeholder="https://example.org" />
                    </div>
                  </form>

                  {createOrg.result.serverError ? (
                    <Alert variant="destructive">
                      <CircleAlertIcon />
                      <AlertTitle>Organization bootstrap failed</AlertTitle>
                      <AlertDescription>{createOrg.result.serverError}</AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
                <CardFooter className="justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    After this step, `/setup` closes and `/` becomes the login page.
                  </p>
                  <Button
                    type="submit"
                    form="setup-org-form"
                    disabled={createOrg.isPending}
                  >
                    Finish setup
                  </Button>
                </CardFooter>
              </Card>
            ) : null}

            <Card className="bg-card/85">
              <CardHeader>
                <CardTitle>What changes after setup?</CardTitle>
                <CardDescription>
                  The first-run wizard is only for bootstrap. Once an organization exists, the app
                  switches to normal auth entry.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">`/setup`</strong> becomes unavailable and
                  redirects to the login page.
                </p>
                <p>
                  <strong className="text-foreground">`/`</strong> becomes the dedicated sign-in
                  page.
                </p>
                <p>
                  Existing admin and member routes stay protected behind authentication and org
                  membership checks.
                </p>
                <p>
                  Need to revisit the decisions? Resetting this wizard only works before the
                  organization is created.
                </p>
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline">
                  <Link href="/">Preview the login entry</Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
