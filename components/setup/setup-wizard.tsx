"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
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
import {
  emailAdminSchema,
  type EmailAdminValues,
  organizationBootstrapSchema,
  type OrganizationBootstrapValues,
} from "@/lib/bootstrap/setup-schemas";
import { authClient } from "@/lib/auth/client";
import { slugify } from "@/lib/slugify";
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
    issues: Array<{
      key: string;
      message: string;
      severity: "error" | "warning";
    }>;
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

type SetupIntentValues = {
  deploymentTrack: SetupDeploymentTrack | "";
  authStrategy: SetupAuthStrategy | "";
};

type SafeFieldErrors<T extends Record<string, unknown>> = Partial<
  Record<keyof T, string[]>
>;

const deploymentOptions: Array<{
  value: SetupDeploymentTrack;
  title: string;
  description: string;
}> = [
  {
    value: "local-docker",
    title: "Local Docker",
    description:
      "For local development with the bundled Postgres and Adminer stack.",
  },
  {
    value: "vps-docker",
    title: "VPS Docker",
    description: "For self-hosted production deployments on your own server.",
  },
  {
    value: "vercel-neon",
    title: "Vercel + Neon",
    description:
      "For a hosted deployment using serverless Postgres and managed env configuration.",
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
    description:
      "Allow password auth and add Google as a secondary sign-in path.",
  },
  {
    value: "google-first",
    title: "Google-first",
    description:
      "Use Google during bootstrap and make it the primary setup flow.",
  },
];

const stepIndex: Record<SetupStep, number> = {
  intent: 1,
  environment: 2,
  readiness: 3,
  admin: 4,
  organization: 5,
};

function readZodFieldError<
  TSchema extends {
    safeParse: (value: unknown) => { success: true } | { success: false; error: { issues: Array<{ message: string }> } };
  },
>(schema: TSchema, value: unknown) {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

function collectMessages(error: unknown): string[] {
  if (!error) {
    return [];
  }

  if (typeof error === "string") {
    return [error];
  }

  if (Array.isArray(error)) {
    return error.flatMap(collectMessages);
  }

  if (
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return [error.message];
  }

  return [];
}

function toFieldErrors(errors: unknown[], serverErrors?: string[]) {
  const messages = [...errors.flatMap(collectMessages), ...(serverErrors ?? [])];
  const uniqueMessages = [...new Set(messages.filter(Boolean))];
  return uniqueMessages.map((message) => ({ message }));
}

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

  const [intentError, setIntentError] = useState<string | null>(null);
  const [adminFormError, setAdminFormError] = useState<string | null>(null);
  const [claimAdminError, setClaimAdminError] = useState<string | null>(null);
  const [organizationFormError, setOrganizationFormError] = useState<
    string | null
  >(null);
  const [adminServerFieldErrors, setAdminServerFieldErrors] = useState<
    SafeFieldErrors<EmailAdminValues>
  >({});
  const [organizationServerFieldErrors, setOrganizationServerFieldErrors] =
    useState<SafeFieldErrors<OrganizationBootstrapValues>>({});

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

  const intentForm = useForm({
    defaultValues: {
      deploymentTrack: state.deploymentTrack ?? "",
      authStrategy: state.authStrategy ?? "",
    } satisfies SetupIntentValues,
    onSubmitInvalid() {
      toast.error("Choose both a deployment track and auth strategy.");
    },
    onSubmit: async ({ value }) => {
      setIntentError(null);

      const result = await saveIntent.executeAsync({
        deploymentTrack: value.deploymentTrack as SetupDeploymentTrack,
        authStrategy: value.authStrategy as SetupAuthStrategy,
      });

      if (result?.serverError) {
        setIntentError(result.serverError);
        toast.error(result.serverError);
      }
    },
  });

  const adminForm = useForm({
    defaultValues: {
      name: viewer?.name ?? "",
      email: state.adminEmail ?? viewer?.email ?? "",
      password: "",
    } satisfies EmailAdminValues,
    onSubmitInvalid() {
      toast.error("Fix the highlighted admin fields.");
    },
    onSubmit: async ({ value }) => {
      setAdminFormError(null);
      setAdminServerFieldErrors({});

      const result = await createEmailAdmin.executeAsync(value);

      if (result?.validationErrors) {
        setAdminServerFieldErrors({
          name: result.validationErrors.name?._errors,
          email: result.validationErrors.email?._errors,
          password: result.validationErrors.password?._errors,
        });
        toast.error("Admin form still has validation issues.");
        return;
      }

      if (result?.serverError) {
        setAdminFormError(result.serverError);
        toast.error(result.serverError);
        return;
      }

      toast.success("First admin account created.");
    },
  });

  const organizationForm = useForm({
    defaultValues: {
      organizationName: "",
      organizationSlug: "",
      legalName: "",
      primaryEmail: state.adminEmail ?? viewer?.email ?? "",
      website: "",
    } satisfies OrganizationBootstrapValues,
    onSubmitInvalid() {
      toast.error("Fix the highlighted organization fields.");
    },
    onSubmit: async ({ value }) => {
      setOrganizationFormError(null);
      setOrganizationServerFieldErrors({});

      const result = await createOrg.executeAsync(value);

      if (result?.validationErrors) {
        setOrganizationServerFieldErrors({
          organizationName: result.validationErrors.organizationName?._errors,
          organizationSlug: result.validationErrors.organizationSlug?._errors,
          legalName: result.validationErrors.legalName?._errors,
          primaryEmail: result.validationErrors.primaryEmail?._errors,
          website: result.validationErrors.website?._errors,
        });
        toast.error("Organization form still has validation issues.");
        return;
      }

      if (result?.serverError) {
        setOrganizationFormError(result.serverError);
        toast.error(result.serverError);
        return;
      }

      toast.success("Setup complete. Redirecting to login.");
    },
  });

  const readinessResult =
    validateReadiness.result.data?.readiness ?? envReadiness;
  const activeStep = stepIndex[currentStep];

  function clearAdminFieldError(field: keyof EmailAdminValues) {
    setAdminFormError(null);
    setAdminServerFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function clearOrganizationFieldError(field: keyof OrganizationBootstrapValues) {
    setOrganizationFormError(null);
    setOrganizationServerFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

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
              This wizard is strict on purpose. It guides deployment, auth,
              first-admin creation, and organization bootstrap in the right
              order so `/` can safely become the login page afterward.
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
                    <div
                      className={`flex size-10 items-center justify-center rounded-full border border-border ${done ? "bg-green-600 text-white" : "bg-secondary"}`}
                    >
                      {done ? (
                        <CheckIcon className="size-4" />
                      ) : (
                        <Icon className="size-4" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{title}</p>
                        {current ? <Badge>Current</Badge> : null}
                      </div>
                      {step === "intent" &&
                      state.deploymentTrack &&
                      state.authStrategy ? (
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
                  {databaseIssue} The setup wizard can still guide environment
                  fixes, but readiness cannot pass until the database is
                  reachable.
                </AlertDescription>
              </Alert>
            ) : null}

            {currentStep === "intent" ? (
              <Card className="bg-card/95">
                <CardHeader>
                  <CardTitle>Step 1 · Choose your setup path</CardTitle>
                  <CardDescription>
                    These choices determine the instructions and env
                    requirements shown next.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="flex flex-col gap-8"
                    onSubmit={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void intentForm.handleSubmit();
                    }}
                  >
                    <FieldGroup>
                      <intentForm.Field
                        name="deploymentTrack"
                        validators={{
                          onSubmit: ({ value }) =>
                            value ? undefined : "Choose a deployment track.",
                        }}
                      >
                        {(field) => {
                          const errors = toFieldErrors(field.state.meta.errors);
                          const showErrors =
                            field.state.meta.isTouched ||
                            field.form.state.submissionAttempts > 0;

                          return (
                            <FieldSet>
                              <FieldLegend>Deployment track</FieldLegend>
                              <FieldDescription>
                                Pick the infrastructure path you are setting up
                                right now.
                              </FieldDescription>
                              <Field
                                data-invalid={showErrors && errors.length > 0}
                              >
                                <ToggleGroup
                                  type="single"
                                  orientation="vertical"
                                  className="grid w-full gap-3"
                                  value={field.state.value}
                                  onValueChange={(value) => {
                                    setIntentError(null);
                                    field.handleChange(
                                      (value as SetupDeploymentTrack | "") || "",
                                    );
                                  }}
                                  aria-invalid={showErrors && errors.length > 0}
                                >
                                  {deploymentOptions.map((option) => (
                                    <ToggleGroupItem
                                      key={option.value}
                                      value={option.value}
                                      variant="outline"
                                      className="h-auto w-full items-start justify-start rounded-2xl px-4 py-4 text-left"
                                    >
                                      <div className="flex flex-col gap-1">
                                        <span className="font-medium">
                                          {option.title}
                                        </span>
                                        <span className="text-sm text-muted-foreground">
                                          {option.description}
                                        </span>
                                      </div>
                                    </ToggleGroupItem>
                                  ))}
                                </ToggleGroup>
                                {showErrors ? (
                                  <FieldError errors={errors} />
                                ) : null}
                              </Field>
                            </FieldSet>
                          );
                        }}
                      </intentForm.Field>

                      <Separator />

                      <intentForm.Field
                        name="authStrategy"
                        validators={{
                          onSubmit: ({ value }) =>
                            value
                              ? undefined
                              : "Choose an authentication strategy.",
                        }}
                      >
                        {(field) => {
                          const errors = toFieldErrors(field.state.meta.errors);
                          const showErrors =
                            field.state.meta.isTouched ||
                            field.form.state.submissionAttempts > 0;

                          return (
                            <FieldSet>
                              <FieldLegend>Authentication strategy</FieldLegend>
                              <FieldDescription>
                                Decide how the app should guide first-run
                                authentication setup.
                              </FieldDescription>
                              <Field
                                data-invalid={showErrors && errors.length > 0}
                              >
                                <ToggleGroup
                                  type="single"
                                  orientation="vertical"
                                  className="grid w-full gap-3"
                                  value={field.state.value}
                                  onValueChange={(value) => {
                                    setIntentError(null);
                                    field.handleChange(
                                      (value as SetupAuthStrategy | "") || "",
                                    );
                                  }}
                                  aria-invalid={showErrors && errors.length > 0}
                                >
                                  {authOptions.map((option) => (
                                    <ToggleGroupItem
                                      key={option.value}
                                      value={option.value}
                                      variant="outline"
                                      className="h-auto w-full items-start justify-start rounded-2xl px-4 py-4 text-left"
                                    >
                                      <div className="flex flex-col gap-1">
                                        <span className="font-medium">
                                          {option.title}
                                        </span>
                                        <span className="text-sm text-muted-foreground">
                                          {option.description}
                                        </span>
                                      </div>
                                    </ToggleGroupItem>
                                  ))}
                                </ToggleGroup>
                                {showErrors ? (
                                  <FieldError errors={errors} />
                                ) : null}
                              </Field>
                            </FieldSet>
                          );
                        }}
                      </intentForm.Field>
                    </FieldGroup>
                  </form>

                  {intentError ? (
                    <Alert variant="destructive" className="mt-6">
                      <CircleAlertIcon />
                      <AlertTitle>Could not save setup path</AlertTitle>
                      <AlertDescription>{intentError}</AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
                <CardFooter className="justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    You can restart this step later if you choose the wrong
                    track.
                  </p>
                  <Button
                    onClick={() => void intentForm.handleSubmit()}
                    disabled={saveIntent.isPending}
                  >
                    Continue to env guidance
                  </Button>
                </CardFooter>
              </Card>
            ) : null}

            {currentStep === "environment" && instructions ? (
              <Card className="bg-card/95">
                <CardHeader>
                  <CardTitle>
                    Step 2 · Follow the tailored environment guide
                  </CardTitle>
                  <CardDescription>
                    Your choices now narrow the required `.env` values and
                    infrastructure steps.
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
                      <p className="font-medium">
                        {instructions.deployment.command}
                      </p>
                      <ul className="mt-3 flex flex-col gap-2">
                        {instructions.deployment.details.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>

                  <div className="grid gap-4">
                    <div>
                      <p className="text-sm font-medium">
                        Required env keys for this path
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Only these values will be enforced in the readiness
                        step.
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
                    <p className="text-sm font-medium">
                      Suggested `.env` shape
                    </p>
                    <Textarea
                      readOnly
                      value={instructions.envSnippet}
                      className="min-h-72 font-mono text-xs"
                    />
                  </div>
                </CardContent>
                <CardFooter className="justify-between gap-4">
                  <Button
                    variant="outline"
                    onClick={() => resetWizard.execute({})}
                  >
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
                    Spoleek checks only the env vars and provider requirements
                    needed for your chosen setup path.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <div className="grid gap-3">
                    {instructions.requiredKeys.map((key) => {
                      const relatedIssue = readinessResult?.issues.find(
                        (issue) => issue.key === key,
                      );
                      const healthy = !relatedIssue;

                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between rounded-xl border border-border/80 bg-background/70 px-4 py-3"
                        >
                          <span className="font-medium">{key}</span>
                          <Badge
                            variant={healthy ? "secondary" : "destructive"}
                          >
                            {healthy ? "Ready" : "Needs attention"}
                          </Badge>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background/70 px-4 py-3">
                      <span className="font-medium">Database connection</span>
                      <Badge
                        variant={
                          readinessResult?.databaseConnectionOk
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {readinessResult?.databaseConnectionOk
                          ? "Reachable"
                          : "Blocked"}
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
                  <Button
                    variant="outline"
                    onClick={() => resetWizard.execute({})}
                  >
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
                    This account will own the first organization and unlock the
                    post-setup login flow.
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
                          Use this account as the first admin if it is the one
                          you want to keep.
                        </p>
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {state.authStrategy !== "google-first" ? (
                    <div className="rounded-2xl border border-border/80 bg-background/70 p-4">
                      <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void adminForm.handleSubmit();
                        }}
                      >
                        <p className="text-sm font-medium">
                          Create admin with email and password
                        </p>
                        <FieldGroup>
                          <div className="grid gap-4 md:grid-cols-2">
                            <adminForm.Field
                              name="name"
                              validators={{
                                onBlur: ({ value }) =>
                                  readZodFieldError(
                                    emailAdminSchema.shape.name,
                                    value,
                                  ),
                                onSubmit: ({ value }) =>
                                  readZodFieldError(
                                    emailAdminSchema.shape.name,
                                    value,
                                  ),
                              }}
                            >
                              {(field) => {
                                const errors = toFieldErrors(
                                  field.state.meta.errors,
                                  adminServerFieldErrors.name,
                                );
                                const showErrors =
                                  field.state.meta.isTouched ||
                                  field.form.state.submissionAttempts > 0;

                                return (
                                  <Field
                                    data-invalid={
                                      showErrors && errors.length > 0
                                    }
                                  >
                                    <FieldLabel htmlFor="setup-admin-name">
                                      Full name
                                    </FieldLabel>
                                    <FieldContent>
                                      <Input
                                        id="setup-admin-name"
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(event) => {
                                          clearAdminFieldError("name");
                                          field.handleChange(
                                            event.target.value,
                                          );
                                        }}
                                        aria-invalid={
                                          showErrors && errors.length > 0
                                        }
                                      />
                                      {showErrors ? (
                                        <FieldError errors={errors} />
                                      ) : null}
                                    </FieldContent>
                                  </Field>
                                );
                              }}
                            </adminForm.Field>

                            <adminForm.Field
                              name="email"
                              validators={{
                                onBlur: ({ value }) =>
                                  readZodFieldError(
                                    emailAdminSchema.shape.email,
                                    value,
                                  ),
                                onSubmit: ({ value }) =>
                                  readZodFieldError(
                                    emailAdminSchema.shape.email,
                                    value,
                                  ),
                              }}
                            >
                              {(field) => {
                                const errors = toFieldErrors(
                                  field.state.meta.errors,
                                  adminServerFieldErrors.email,
                                );
                                const showErrors =
                                  field.state.meta.isTouched ||
                                  field.form.state.submissionAttempts > 0;

                                return (
                                  <Field
                                    data-invalid={
                                      showErrors && errors.length > 0
                                    }
                                  >
                                    <FieldLabel htmlFor="setup-admin-email">
                                      Email
                                    </FieldLabel>
                                    <FieldContent>
                                      <Input
                                        id="setup-admin-email"
                                        type="email"
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(event) => {
                                          clearAdminFieldError("email");
                                          field.handleChange(
                                            event.target.value,
                                          );
                                        }}
                                        aria-invalid={
                                          showErrors && errors.length > 0
                                        }
                                      />
                                      {showErrors ? (
                                        <FieldError errors={errors} />
                                      ) : null}
                                    </FieldContent>
                                  </Field>
                                );
                              }}
                            </adminForm.Field>
                          </div>

                          <adminForm.Field
                            name="password"
                            validators={{
                              onBlur: ({ value }) =>
                                readZodFieldError(
                                  emailAdminSchema.shape.password,
                                  value,
                                ),
                              onSubmit: ({ value }) =>
                                readZodFieldError(
                                  emailAdminSchema.shape.password,
                                  value,
                                ),
                            }}
                          >
                            {(field) => {
                              const errors = toFieldErrors(
                                field.state.meta.errors,
                                adminServerFieldErrors.password,
                              );
                              const showErrors =
                                field.state.meta.isTouched ||
                                field.form.state.submissionAttempts > 0;

                              return (
                                <Field
                                  data-invalid={showErrors && errors.length > 0}
                                >
                                  <FieldLabel htmlFor="setup-admin-password">
                                    Password
                                  </FieldLabel>
                                  <FieldContent>
                                    <Input
                                      id="setup-admin-password"
                                      type="password"
                                      value={field.state.value}
                                      onBlur={field.handleBlur}
                                      onChange={(event) => {
                                        clearAdminFieldError("password");
                                        field.handleChange(
                                          event.target.value,
                                        );
                                      }}
                                      aria-invalid={
                                        showErrors && errors.length > 0
                                      }
                                    />
                                    {showErrors ? (
                                      <FieldError errors={errors} />
                                    ) : null}
                                  </FieldContent>
                                </Field>
                              );
                            }}
                          </adminForm.Field>
                        </FieldGroup>

                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            disabled={createEmailAdmin.isPending}
                          >
                            Create first admin
                          </Button>
                        </div>
                      </form>
                    </div>
                  ) : null}

                  {state.authStrategy !== "email-password" ? (
                    <div className="grid gap-4 rounded-2xl border border-border/80 bg-background/70 p-4">
                      <p className="text-sm font-medium">
                        Use Google during setup
                      </p>
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
                          onClick={async () => {
                            setClaimAdminError(null);
                            const result = await claimAdmin.executeAsync({});

                            if (result?.serverError) {
                              setClaimAdminError(result.serverError);
                              toast.error(result.serverError);
                              return;
                            }

                            toast.success(
                              "Current session claimed as the first admin.",
                            );
                          }}
                        >
                          Use current session as first admin
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {adminFormError ? (
                    <Alert variant="destructive">
                      <CircleAlertIcon />
                      <AlertTitle>Admin creation failed</AlertTitle>
                      <AlertDescription>{adminFormError}</AlertDescription>
                    </Alert>
                  ) : null}

                  {claimAdminError ? (
                    <Alert variant="destructive">
                      <CircleAlertIcon />
                      <AlertTitle>
                        Could not claim the current session
                      </AlertTitle>
                      <AlertDescription>{claimAdminError}</AlertDescription>
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
                    This final step writes the first organization, marks setup
                    complete, and makes `/` the dedicated login page.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <Alert>
                    <ShieldCheckIcon />
                    <AlertTitle>First admin</AlertTitle>
                    <AlertDescription>
                      {state.adminEmail ? (
                        <span>
                          {state.adminEmail} will be assigned as the initial org
                          admin.
                        </span>
                      ) : (
                        <span>Finish the admin step before continuing.</span>
                      )}
                    </AlertDescription>
                  </Alert>

                  <form
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void organizationForm.handleSubmit();
                    }}
                  >
                    <FieldGroup>
                      <div className="grid gap-4 md:grid-cols-2">
                        <organizationForm.Field
                          name="organizationName"
                          validators={{
                            onBlur: ({ value }) =>
                              readZodFieldError(
                                organizationBootstrapSchema.shape
                                  .organizationName,
                                value,
                              ),
                            onSubmit: ({ value }) =>
                              readZodFieldError(
                                organizationBootstrapSchema.shape
                                  .organizationName,
                                value,
                              ),
                          }}
                        >
                          {(field) => {
                            const errors = toFieldErrors(
                              field.state.meta.errors,
                              organizationServerFieldErrors.organizationName,
                            );
                            const showErrors =
                              field.state.meta.isTouched ||
                              field.form.state.submissionAttempts > 0;

                            return (
                              <Field
                                data-invalid={showErrors && errors.length > 0}
                              >
                                <FieldLabel htmlFor="organization-name">
                                  Organization name
                                </FieldLabel>
                                <FieldContent>
                                  <Input
                                    id="organization-name"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(event) => {
                                      clearOrganizationFieldError(
                                        "organizationName",
                                      );
                                      clearOrganizationFieldError(
                                        "organizationSlug",
                                      );
                                      field.handleChange(event.target.value);
                                      organizationForm.setFieldValue(
                                        "organizationSlug",
                                        slugify(event.target.value),
                                      );
                                    }}
                                    aria-invalid={
                                      showErrors && errors.length > 0
                                    }
                                  />
                                  {showErrors ? (
                                    <FieldError errors={errors} />
                                  ) : null}
                                </FieldContent>
                              </Field>
                            );
                          }}
                        </organizationForm.Field>

                        <organizationForm.Field
                          name="organizationSlug"
                          validators={{
                            onBlur: ({ value }) =>
                              readZodFieldError(
                                organizationBootstrapSchema.shape
                                  .organizationSlug,
                                value,
                              ),
                            onSubmit: ({ value }) =>
                              readZodFieldError(
                                organizationBootstrapSchema.shape
                                  .organizationSlug,
                                value,
                              ),
                          }}
                        >
                          {(field) => {
                            const errors = toFieldErrors(
                              field.state.meta.errors,
                              organizationServerFieldErrors.organizationSlug,
                            );
                            const showErrors =
                              field.state.meta.isTouched ||
                              field.form.state.submissionAttempts > 0;

                            return (
                              <Field
                                data-invalid={showErrors && errors.length > 0}
                              >
                                <FieldLabel htmlFor="organization-slug">
                                  Organization slug
                                </FieldLabel>
                                <FieldContent>
                                  <Input
                                    id="organization-slug"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(event) => {
                                      clearOrganizationFieldError(
                                        "organizationSlug",
                                      );
                                      field.handleChange(event.target.value);
                                    }}
                                    aria-invalid={
                                      showErrors && errors.length > 0
                                    }
                                  />
                                  <FieldDescription>
                                    Lowercase letters, numbers, and hyphens
                                    only.
                                  </FieldDescription>
                                  {showErrors ? (
                                    <FieldError errors={errors} />
                                  ) : null}
                                </FieldContent>
                              </Field>
                            );
                          }}
                        </organizationForm.Field>

                        <organizationForm.Field
                          name="legalName"
                          validators={{
                            onBlur: ({ value }) =>
                              readZodFieldError(
                                organizationBootstrapSchema.shape.legalName,
                                value,
                              ),
                            onSubmit: ({ value }) =>
                              readZodFieldError(
                                organizationBootstrapSchema.shape.legalName,
                                value,
                              ),
                          }}
                        >
                          {(field) => {
                            const errors = toFieldErrors(
                              field.state.meta.errors,
                              organizationServerFieldErrors.legalName,
                            );
                            const showErrors =
                              field.state.meta.isTouched ||
                              field.form.state.submissionAttempts > 0;

                            return (
                              <Field
                                data-invalid={showErrors && errors.length > 0}
                              >
                                <FieldLabel htmlFor="legal-name">
                                  Legal entity name
                                </FieldLabel>
                                <FieldContent>
                                  <Input
                                    id="legal-name"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(event) => {
                                      clearOrganizationFieldError("legalName");
                                      field.handleChange(event.target.value);
                                    }}
                                    aria-invalid={
                                      showErrors && errors.length > 0
                                    }
                                  />
                                  {showErrors ? (
                                    <FieldError errors={errors} />
                                  ) : null}
                                </FieldContent>
                              </Field>
                            );
                          }}
                        </organizationForm.Field>

                        <organizationForm.Field
                          name="primaryEmail"
                          validators={{
                            onBlur: ({ value }) =>
                              readZodFieldError(
                                organizationBootstrapSchema.shape.primaryEmail,
                                value,
                              ),
                            onSubmit: ({ value }) =>
                              readZodFieldError(
                                organizationBootstrapSchema.shape.primaryEmail,
                                value,
                              ),
                          }}
                        >
                          {(field) => {
                            const errors = toFieldErrors(
                              field.state.meta.errors,
                              organizationServerFieldErrors.primaryEmail,
                            );
                            const showErrors =
                              field.state.meta.isTouched ||
                              field.form.state.submissionAttempts > 0;

                            return (
                              <Field
                                data-invalid={showErrors && errors.length > 0}
                              >
                                <FieldLabel htmlFor="primary-email">
                                  Primary email
                                </FieldLabel>
                                <FieldContent>
                                  <Input
                                    id="primary-email"
                                    type="email"
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(event) => {
                                      clearOrganizationFieldError(
                                        "primaryEmail",
                                      );
                                      field.handleChange(event.target.value);
                                    }}
                                    aria-invalid={
                                      showErrors && errors.length > 0
                                    }
                                  />
                                  {showErrors ? (
                                    <FieldError errors={errors} />
                                  ) : null}
                                </FieldContent>
                              </Field>
                            );
                          }}
                        </organizationForm.Field>
                      </div>

                      <organizationForm.Field
                        name="website"
                        validators={{
                          onBlur: ({ value }) =>
                            readZodFieldError(
                              organizationBootstrapSchema.shape.website,
                              value,
                            ),
                          onSubmit: ({ value }) =>
                            readZodFieldError(
                              organizationBootstrapSchema.shape.website,
                              value,
                            ),
                        }}
                      >
                        {(field) => {
                          const errors = toFieldErrors(
                            field.state.meta.errors,
                            organizationServerFieldErrors.website,
                          );
                          const showErrors =
                            field.state.meta.isTouched ||
                            field.form.state.submissionAttempts > 0;

                          return (
                            <Field
                              data-invalid={showErrors && errors.length > 0}
                            >
                              <FieldLabel htmlFor="website">Website</FieldLabel>
                              <FieldContent>
                                <Input
                                  id="website"
                                  placeholder="https://example.org"
                                  value={field.state.value ?? ""}
                                  onBlur={field.handleBlur}
                                  onChange={(event) => {
                                    clearOrganizationFieldError("website");
                                    field.handleChange(event.target.value);
                                  }}
                                  aria-invalid={
                                    showErrors && errors.length > 0
                                  }
                                />
                                {showErrors ? (
                                  <FieldError errors={errors} />
                                ) : null}
                              </FieldContent>
                            </Field>
                          );
                        }}
                      </organizationForm.Field>
                    </FieldGroup>
                  </form>

                  {organizationFormError ? (
                    <Alert variant="destructive">
                      <CircleAlertIcon />
                      <AlertTitle>Organization bootstrap failed</AlertTitle>
                      <AlertDescription>
                        {organizationFormError}
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
                <CardFooter className="justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    After this step, `/setup` closes and `/` becomes the login
                    page.
                  </p>
                  <Button
                    type="submit"
                    onClick={() => void organizationForm.handleSubmit()}
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
                  The first-run wizard is only for bootstrap. Once an
                  organization exists, the app switches to normal auth entry.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">`/setup`</strong> becomes
                  unavailable and redirects to the login page.
                </p>
                <p>
                  <strong className="text-foreground">`/`</strong> becomes the
                  dedicated sign-in page.
                </p>
                <p>
                  Existing admin and member routes stay protected behind
                  authentication and org membership checks.
                </p>
                <p>
                  Need to revisit the decisions? Resetting this wizard only
                  works before the organization is created.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
