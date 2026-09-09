"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import {
  Building2Icon,
  CheckIcon,
  CircleAlertIcon,
  CloudCogIcon,
  DatabaseZapIcon,
  ExternalLinkIcon,
  HardDriveDownloadIcon,
  KeyRoundIcon,
  LinkIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
} from "lucide-react";

import {
  authStrategyLabels,
  deploymentTrackLabels,
  deriveWorkspaceDomainFromEmail,
  getSetupStepsFor,
  type SetupAuthStrategy,
  type SetupDeploymentTrack,
  type SetupStep,
} from "@/lib/bootstrap";
import {
  emailAdminSchema,
  type EmailAdminValues,
  organizationBootstrapSchema,
  organizationBootstrapWithMembershipSchema,
  type OrganizationBootstrapWithMembershipValues,
  setupWorkspaceConfigSchema,
  type SetupWorkspaceConfigValues,
} from "@/lib/bootstrap/setup-schemas";
import {
  feeCurrencyOptions,
  membershipManagementModeOptions,
} from "@/lib/membership";
import { authClient } from "@/lib/auth/client";
import { slugify } from "@/lib/slugify";
import {
  advanceSetupEnvironmentAction,
  claimSetupSessionAdminAction,
  completeSetupAction,
  createBootstrapOrganizationAction,
  editSetupOrganizationProfileAction,
  createSetupEmailAdminAction,
  resetSetupWizardAction,
  saveSetupIntentAction,
  saveSetupOrganizationProfileAction,
  saveSetupWorkspaceConfigAction,
  setSetupAdminMembershipAction,
  validateSetupEnvironmentAction,
} from "@/server/actions/bootstrap";
import { saveWorkspaceProvisionFieldsAction } from "@/server/actions/organization-settings";
import {
  WorkspaceProvisionFields,
  toProvisionFieldState,
} from "@/components/app/workspace-provision-fields";
import { RadioChoiceGroup } from "@/components/app/radio-choice-group";
import { SwitchChoiceField } from "@/components/app/switch-choice-field";
import {
  DEFAULT_WORKSPACE_EMAIL_TEMPLATE,
  renderWorkspaceEmailLocalPart,
} from "@/server/lib/workspace/email-template";
import type { WorkspaceProvisionFieldConfig } from "@/server/lib/workspace/field-catalog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CodeBlock,
  CodeBlockContent,
  CodeBlockGroup,
  CodeBlockHeader,
  CodeBlockIcon,
} from "@/components/ui/code-block/code-block";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { CopyButton } from "../ui/code-block/copy-button";

type SetupWizardProps = {
  currentStep: SetupStep;
  state: {
    deploymentTrack?: SetupDeploymentTrack;
    authStrategy?: SetupAuthStrategy;
    workspaceModuleEnabled?: boolean;
    adminEmail?: string;
    workspaceDomain?: string;
    workspaceEmailTemplate?: string;
    workspaceDefaultEmailPreference?: "personal" | "workspace";
    createAdminAsMember?: boolean;
    organizationName?: string;
    organizationSlug?: string;
    legalName?: string;
    primaryEmail?: string;
    website?: string;
    organizationId?: string;
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
  /**
   * Set when DEPLOYMENT_MODE pins the track in the environment. The choice is
   * then shown as already made rather than hidden, so the operator can see
   * which track the rest of the wizard is tailoring itself to.
   */
  lockedDeploymentTrack: SetupDeploymentTrack | null;
  workspaceConnectState: {
    connected: boolean;
    domain: string | null;
    emailTemplate: string | null;
    adminEmail: string | null;
    provisionFields: WorkspaceProvisionFieldConfig[];
    customFields: { key: string; label: string }[];
  } | null;
};

type SetupIntentValues = {
  deploymentTrack: SetupDeploymentTrack | "";
  authStrategy: SetupAuthStrategy | "google-workspace" | "";
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
  value: SetupAuthStrategy | "google-workspace";
  title: string;
  description: string;
}> = [
  {
    value: "email-password",
    title: "Email and password only",
    description:
      "Members sign in with email/password after admins approve them and Spoleek emails an activation link.",
  },
  {
    value: "email-password-google",
    title: "Email/password + Google",
    description:
      "Use invite-only email/password activation for members and also offer Google as a secondary sign-in path.",
  },
  {
    value: "google-first",
    title: "Google-first",
    description:
      "Use Google during bootstrap and make it the primary setup flow.",
  },
  {
    value: "google-workspace",
    title: "Google Workspace",
    description:
      "Use Google as the only sign-in method and enable the Workspace module for domain-based member provisioning. Full OAuth connection happens after setup.",
  },
];

const stepMeta: Record<
  SetupStep,
  { title: string; icon: typeof HardDriveDownloadIcon }
> = {
  intent: { title: "Choose setup path", icon: HardDriveDownloadIcon },
  environment: { title: "Follow tailored env guidance", icon: CloudCogIcon },
  readiness: { title: "Validate readiness", icon: DatabaseZapIcon },
  admin: { title: "Create first admin", icon: KeyRoundIcon },
  workspace: { title: "Configure Workspace", icon: Building2Icon },
  organization: { title: "Describe the organization", icon: Building2Icon },
  membership: { title: "Set up membership", icon: ShieldCheckIcon },
  connect: { title: "Connect Google Workspace", icon: LinkIcon },
};

function readZodFieldError<
  TSchema extends {
    safeParse: (
      value: unknown,
    ) =>
      | { success: true }
      | { success: false; error: { issues: Array<{ message: string }> } };
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

function decodeWorkspaceMessage(value: string | null) {
  if (!value) return "Google did not return a reason.";
  switch (value) {
    case "invalid_state":
      return "The OAuth state could not be verified. Start the connection again.";
    case "no_refresh_token":
      return "Google did not return a refresh token. Revoke Spoleek's access in your Google account and retry.";
    case "domain_mismatch":
      return "That Google account does not belong to the workspace domain you configured.";
    case "domain_missing":
      return "The workspace domain is missing on the organization.";
    case "access_denied":
      return "You cancelled the Google consent screen.";
    default:
      return value;
  }
}

function toFieldErrors(errors: unknown[], serverErrors?: string[]) {
  const messages = [
    ...errors.flatMap(collectMessages),
    ...(serverErrors ?? []),
  ];
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
  workspaceConnectState,
  lockedDeploymentTrack,
}: SetupWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceCallbackStatus = searchParams.get("workspace");
  const workspaceCallbackMessage = searchParams.get("workspaceMessage");

  const [intentError, setIntentError] = useState<string | null>(null);
  const [adminFormError, setAdminFormError] = useState<string | null>(null);
  const [claimAdminError, setClaimAdminError] = useState<string | null>(null);
  const [workspaceFormError, setWorkspaceFormError] = useState<string | null>(
    null,
  );
  const [organizationFormError, setOrganizationFormError] = useState<
    string | null
  >(null);
  const [adminServerFieldErrors, setAdminServerFieldErrors] = useState<
    SafeFieldErrors<EmailAdminValues>
  >({});
  const [organizationServerFieldErrors, setOrganizationServerFieldErrors] =
    useState<SafeFieldErrors<OrganizationBootstrapWithMembershipValues>>({});

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
    onSuccess({ data }) {
      // Workspace setups stay in the wizard: the OAuth grant needs the orgId
      // that was just written, so the connect step renders next.
      if (data?.workspaceModuleEnabled) {
        router.refresh();
        return;
      }

      router.push("/");
      router.refresh();
    },
  });
  const setAdminMembership = useAction(setSetupAdminMembershipAction);
  const [createAdminAsMember, setCreateAdminAsMember] = useState(
    state.createAdminAsMember ?? true,
  );
  const saveOrgProfile = useAction(saveSetupOrganizationProfileAction, {
    onSuccess() {
      router.refresh();
    },
  });
  const editOrgProfile = useAction(editSetupOrganizationProfileAction, {
    onSuccess() {
      router.refresh();
    },
  });
  const saveWorkspaceConfig = useAction(saveSetupWorkspaceConfigAction, {
    onSuccess() {
      router.refresh();
    },
  });
  const saveProvisionFields = useAction(saveWorkspaceProvisionFieldsAction);
  const completeSetup = useAction(completeSetupAction);
  const resetWizard = useAction(resetSetupWizardAction, {
    onSuccess() {
      router.refresh();
    },
  });

  // Locking greys out the alternatives instead of removing them: the operator
  // sees the full set of tracks and which one the env file already committed to.
  const resolvedDeploymentOptions = lockedDeploymentTrack
    ? deploymentOptions.map((option) => ({
        ...option,
        disabled: option.value !== lockedDeploymentTrack,
      }))
    : deploymentOptions;

  const intentForm = useForm({
    defaultValues: {
      deploymentTrack: (state.deploymentTrack ?? "") as
        | SetupDeploymentTrack
        | "",
      authStrategy: (state.workspaceModuleEnabled &&
      state.authStrategy === "google-first"
        ? "google-workspace"
        : (state.authStrategy ?? "")) as
        | SetupAuthStrategy
        | "google-workspace"
        | "",
    } satisfies SetupIntentValues,
    onSubmitInvalid() {
      toast.error("Choose both a deployment track and auth strategy.");
    },
    onSubmit: async ({ value }) => {
      setIntentError(null);

      const result = await saveIntent.executeAsync({
        deploymentTrack: value.deploymentTrack as SetupDeploymentTrack,
        authStrategy: value.authStrategy as
          | SetupAuthStrategy
          | "google-workspace",
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
      organizationName: state.organizationName ?? "",
      organizationSlug: state.organizationSlug ?? "",
      legalName: state.legalName ?? "",
      primaryEmail:
        state.primaryEmail ?? state.adminEmail ?? viewer?.email ?? "",
      website: state.website ?? "",
      membershipManagementMode: "none" as "none" | "periodic_renewal",
      membershipRenewalMonth: null as number | null,
      membershipRenewalDay: null as number | null,
      membershipFeeEnabled: false as boolean,
      membershipFeeAmount: null as number | null,
      membershipFeeCurrency: "CZK" as string,
      membershipFeeBankAccount: null as string | null,
      membershipFeePaymentWindowDays: 30 as number,
    } as OrganizationBootstrapWithMembershipValues,
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
          membershipManagementMode:
            result.validationErrors.membershipManagementMode?._errors,
          membershipRenewalMonth:
            result.validationErrors.membershipRenewalMonth?._errors,
          membershipRenewalDay:
            result.validationErrors.membershipRenewalDay?._errors,
          membershipFeeAmount:
            result.validationErrors.membershipFeeAmount?._errors,
          membershipFeeBankAccount:
            result.validationErrors.membershipFeeBankAccount?._errors,
        });
        toast.error("Organization form still has validation issues.");
        return;
      }

      if (result?.serverError) {
        setOrganizationFormError(result.serverError);
        toast.error(result.serverError);
        return;
      }

      toast.success(
        state.workspaceModuleEnabled
          ? "Organization created. One step left: connect Google Workspace."
          : "Setup complete. Redirecting to login.",
      );
    },
  });

  // The Workspace track signs the first admin in with Google, so their address
  // is the strongest available hint at the domain being set up.
  const suggestedWorkspaceDomain = deriveWorkspaceDomainFromEmail(
    state.adminEmail ?? viewer?.email,
  );

  const workspaceForm = useForm({
    defaultValues: {
      workspaceDomain: state.workspaceDomain ?? suggestedWorkspaceDomain ?? "",
      workspaceEmailTemplate:
        state.workspaceEmailTemplate ?? DEFAULT_WORKSPACE_EMAIL_TEMPLATE,
      defaultEmailPreference:
        state.workspaceDefaultEmailPreference ?? "workspace",
    } satisfies SetupWorkspaceConfigValues,
    onSubmitInvalid() {
      toast.error("Fix the highlighted Workspace fields.");
    },
    onSubmit: async ({ value }) => {
      setWorkspaceFormError(null);

      const result = await saveWorkspaceConfig.executeAsync(value);

      if (result?.serverError) {
        setWorkspaceFormError(result.serverError);
        toast.error(result.serverError);
      }
    },
  });

  /**
   * The organization step owns only the identity half of the form, so it
   * validates that slice on its own instead of running the full submit.
   */
  const identityFields = [
    "organizationName",
    "organizationSlug",
    "legalName",
    "primaryEmail",
    "website",
  ] as const;

  const submitOrganizationProfile = async () => {
    setOrganizationFormError(null);
    setOrganizationServerFieldErrors({});

    const values = organizationForm.state.values;
    const parsed = organizationBootstrapSchema.safeParse({
      organizationName: values.organizationName,
      organizationSlug: values.organizationSlug,
      legalName: values.legalName,
      primaryEmail: values.primaryEmail,
      website: values.website,
    });

    for (const field of identityFields) {
      organizationForm.setFieldMeta(field, (meta) => ({
        ...meta,
        isTouched: true,
      }));
    }

    if (!parsed.success) {
      const fieldErrors: SafeFieldErrors<OrganizationBootstrapWithMembershipValues> =
        {};

      for (const issue of parsed.error.issues) {
        const key = issue
          .path[0] as keyof OrganizationBootstrapWithMembershipValues;
        fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
      }

      setOrganizationServerFieldErrors(fieldErrors);
      toast.error("Fix the highlighted organization fields.");
      return;
    }

    const result = await saveOrgProfile.executeAsync(parsed.data);

    if (result?.validationErrors) {
      setOrganizationServerFieldErrors({
        organizationName: result.validationErrors.organizationName?._errors,
        organizationSlug: result.validationErrors.organizationSlug?._errors,
        legalName: result.validationErrors.legalName?._errors,
        primaryEmail: result.validationErrors.primaryEmail?._errors,
        website: result.validationErrors.website?._errors,
      });
      toast.error("Organization details still have validation issues.");
      return;
    }

    if (result?.serverError) {
      setOrganizationFormError(result.serverError);
      toast.error(result.serverError);
    }
  };

  const [provisionFields, setProvisionFields] = useState<
    WorkspaceProvisionFieldConfig[]
  >(() => toProvisionFieldState(workspaceConnectState?.provisionFields ?? []));

  const finishSetup = async (saveFields: boolean) => {
    if (saveFields) {
      const result = await saveProvisionFields.executeAsync({
        fields: provisionFields.filter((field) => field.enabled),
      });

      if (result?.serverError) {
        toast.error(result.serverError);
        return;
      }
    }

    await completeSetup.executeAsync({});
    toast.success("Setup complete.");
    router.push("/admin");
    router.refresh();
  };

  const readinessResult =
    validateReadiness.result.data?.readiness ?? envReadiness;
  const steps = getSetupStepsFor(Boolean(state.workspaceModuleEnabled));
  const stepNumber = (step: SetupStep) => steps.indexOf(step) + 1;
  const activeStep = stepNumber(currentStep);

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

  function clearOrganizationFieldError(
    field: keyof OrganizationBootstrapWithMembershipValues | string,
  ) {
    setOrganizationFormError(null);
    setOrganizationServerFieldErrors((current) => {
      const key = field as keyof OrganizationBootstrapWithMembershipValues;
      if (!current[key]) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  return (
    <div className="min-h-screen public-surface">
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
              order so `/` can safely become the login page afterward. In
              email/password setups, member access stays invite-only after admin
              approval.
            </p>
          </div>
          {currentStep === "connect" ? null : (
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => resetWizard.execute({})}>
                Start over
              </Button>
            </div>
          )}
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
              {steps.map((step) => {
                const { title, icon: Icon } = stepMeta[step];
                const index = stepNumber(step);
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
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <p className="text-sm text-muted-foreground">
                            {deploymentTrackLabels[state.deploymentTrack]} +{" "}
                            {authStrategyLabels[state.authStrategy]}
                          </p>
                          {state.workspaceModuleEnabled ? (
                            <Badge variant="secondary">+ Workspace</Badge>
                          ) : null}
                        </div>
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
                  <CardTitle>
                    Step {stepNumber("intent")} · Choose your setup path
                  </CardTitle>
                  <CardDescription>
                    These choices determine the instructions and env
                    requirements shown next, including whether member activation
                    emails must be configured.
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
                                {lockedDeploymentTrack
                                  ? `Set by DEPLOYMENT_MODE in the environment, so it cannot be changed here. Edit that variable and reload to switch tracks.`
                                  : "Pick the infrastructure path you are setting up right now."}
                              </FieldDescription>
                              <Field
                                data-invalid={showErrors && errors.length > 0}
                              >
                                <RadioChoiceGroup
                                  idPrefix="setup-deployment-track"
                                  className="w-full"
                                  value={field.state.value}
                                  onValueChange={(value) => {
                                    setIntentError(null);
                                    field.handleChange(value);
                                  }}
                                  options={resolvedDeploymentOptions}
                                  invalid={showErrors && errors.length > 0}
                                />
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
                                <RadioChoiceGroup
                                  idPrefix="setup-auth-strategy"
                                  className="w-full"
                                  value={field.state.value}
                                  onValueChange={(value) => {
                                    setIntentError(null);
                                    field.handleChange(value);
                                  }}
                                  options={authOptions}
                                  invalid={showErrors && errors.length > 0}
                                />
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
                    {lockedDeploymentTrack
                      ? "The deployment track comes from DEPLOYMENT_MODE; you can still revisit the authentication choice later."
                      : "You can restart this step later if you choose the wrong track."}
                  </p>
                  <Button
                    onClick={() => void intentForm.handleSubmit()}
                    disabled={saveIntent.isPending}
                  >
                    Save and continue
                  </Button>
                </CardFooter>
              </Card>
            ) : null}

            {currentStep === "environment" && instructions ? (
              <Card className="bg-card/95">
                <CardHeader>
                  <CardTitle>
                    Step {stepNumber("environment")} · Follow the tailored
                    environment guide
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
                    <AlertDescription className="mt-2">
                      <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
                        {instructions.deployment.command}
                      </code>
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
                    <CodeBlock>
                      <CodeBlockHeader>
                        <CodeBlockGroup>
                          <CodeBlockIcon language="env" />
                          <span>.env</span>
                        </CodeBlockGroup>
                        <CopyButton content={instructions.envSnippet} />
                      </CodeBlockHeader>
                      <CodeBlockContent className="max-h-none overflow-x-auto p-4 text-xs leading-6 whitespace-pre-wrap">
                        <code>{instructions.envSnippet}</code>
                      </CodeBlockContent>
                    </CodeBlock>
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
                  <CardTitle>
                    Step {stepNumber("readiness")} · Validate readiness
                  </CardTitle>
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
                  <CardTitle>
                    Step {stepNumber("admin")} · Create the first admin account
                  </CardTitle>
                  <CardDescription>
                    This account will own the first organization and unlock the
                    post-setup login flow. Public member self-registration stays
                    disabled in email/password modes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  <SwitchChoiceField
                    id="setup-admin-as-member"
                    title="Also add this admin as a member"
                    description="Adds the admin to the organization's membership — counted in member lists, renewals, and fees. Turn it off for a manager who administers the organization without belonging to it. Admin access is unaffected either way, and you can add them as a member later."
                    checked={createAdminAsMember}
                    onCheckedChange={(checked) => {
                      setCreateAdminAsMember(checked);
                      setAdminMembership.execute({
                        createAdminAsMember: checked,
                      });
                    }}
                  />

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
                        <p className="text-sm text-muted-foreground">
                          This creates the first internal admin account only.
                          Members will still need admin approval and an
                          activation email before they can set a password.
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
                              callbackURL: new URL(
                                "/setup",
                                window.location.origin,
                              ).toString(),
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

            {currentStep === "workspace" ? (
              <Card className="bg-card/95">
                <CardHeader>
                  <CardTitle>
                    Step {stepNumber("workspace")} · Configure Google Workspace
                  </CardTitle>
                  <CardDescription>
                    These values are written onto the organization when it is
                    created, so member provisioning works the moment you connect
                    your Google admin account in the next step.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="flex flex-col gap-6"
                    onSubmit={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void workspaceForm.handleSubmit();
                    }}
                  >
                    <FieldGroup>
                      <workspaceForm.Field
                        name="workspaceDomain"
                        validators={{
                          onBlur: ({ value }) =>
                            readZodFieldError(
                              setupWorkspaceConfigSchema.shape.workspaceDomain,
                              value,
                            ),
                          onSubmit: ({ value }) =>
                            readZodFieldError(
                              setupWorkspaceConfigSchema.shape.workspaceDomain,
                              value,
                            ),
                        }}
                      >
                        {(field) => {
                          const errors = toFieldErrors(field.state.meta.errors);
                          const showErrors =
                            field.state.meta.isTouched ||
                            field.form.state.submissionAttempts > 0;

                          return (
                            <Field
                              data-invalid={showErrors && errors.length > 0}
                            >
                              <FieldLabel htmlFor="setup-workspace-domain">
                                Workspace domain
                              </FieldLabel>
                              <FieldContent>
                                <Input
                                  id="setup-workspace-domain"
                                  value={field.state.value}
                                  onBlur={field.handleBlur}
                                  onChange={(event) => {
                                    setWorkspaceFormError(null);
                                    field.handleChange(event.target.value);
                                  }}
                                  placeholder="spoleek.org"
                                  autoComplete="off"
                                  spellCheck={false}
                                  aria-invalid={showErrors && errors.length > 0}
                                />
                                <FieldDescription>
                                  {suggestedWorkspaceDomain &&
                                  field.state.value === suggestedWorkspaceDomain
                                    ? `Detected from your admin account (${state.adminEmail ?? viewer?.email}). Change it if your Workspace uses a different primary domain.`
                                    : "The Google account you connect next must be a super-admin on this domain."}
                                </FieldDescription>
                                {showErrors ? (
                                  <FieldError errors={errors} />
                                ) : null}
                              </FieldContent>
                            </Field>
                          );
                        }}
                      </workspaceForm.Field>

                      <workspaceForm.Field
                        name="workspaceEmailTemplate"
                        validators={{
                          onBlur: ({ value }) =>
                            readZodFieldError(
                              setupWorkspaceConfigSchema.shape
                                .workspaceEmailTemplate,
                              value,
                            ),
                          onSubmit: ({ value }) =>
                            readZodFieldError(
                              setupWorkspaceConfigSchema.shape
                                .workspaceEmailTemplate,
                              value,
                            ),
                        }}
                      >
                        {(field) => {
                          const errors = toFieldErrors(field.state.meta.errors);
                          const showErrors =
                            field.state.meta.isTouched ||
                            field.form.state.submissionAttempts > 0;

                          return (
                            <Field
                              data-invalid={showErrors && errors.length > 0}
                            >
                              <FieldLabel htmlFor="setup-workspace-template">
                                Email template
                              </FieldLabel>
                              <FieldContent>
                                <Input
                                  id="setup-workspace-template"
                                  value={field.state.value}
                                  onBlur={field.handleBlur}
                                  onChange={(event) => {
                                    setWorkspaceFormError(null);
                                    field.handleChange(event.target.value);
                                  }}
                                  placeholder={DEFAULT_WORKSPACE_EMAIL_TEMPLATE}
                                  autoComplete="off"
                                  spellCheck={false}
                                  aria-invalid={showErrors && errors.length > 0}
                                />
                                <FieldDescription>
                                  Placeholders: <code>{"{first}"}</code>,{" "}
                                  <code>{"{last}"}</code>,{" "}
                                  <code>{"{initial}"}</code>. Preview for Jane
                                  Doe:{" "}
                                  <span className="font-mono text-foreground">
                                    {renderWorkspaceEmailLocalPart({
                                      template:
                                        field.state.value ||
                                        DEFAULT_WORKSPACE_EMAIL_TEMPLATE,
                                      firstName: "Jane",
                                      lastName: "Doe",
                                    })}
                                    <workspaceForm.Subscribe
                                      selector={(s) => s.values.workspaceDomain}
                                    >
                                      {(domain) =>
                                        domain
                                          ? `@${domain.trim().toLowerCase()}`
                                          : ""
                                      }
                                    </workspaceForm.Subscribe>
                                  </span>
                                </FieldDescription>
                                {showErrors ? (
                                  <FieldError errors={errors} />
                                ) : null}
                              </FieldContent>
                            </Field>
                          );
                        }}
                      </workspaceForm.Field>

                      <workspaceForm.Field name="defaultEmailPreference">
                        {(field) => (
                          <FieldSet>
                            <FieldLegend>Default preferred email</FieldLegend>
                            <FieldDescription>
                              Which address Spoleek uses for members who have
                              not set their own preference.
                            </FieldDescription>
                            <RadioChoiceGroup
                              idPrefix="setup-workspace-email-preference"
                              className="w-full"
                              value={field.state.value}
                              onValueChange={field.handleChange}
                              options={[
                                {
                                  value: "workspace" as const,
                                  title: "Workspace email",
                                  description:
                                    "Use the provisioned Workspace address as the primary contact.",
                                },
                                {
                                  value: "personal" as const,
                                  title: "Personal email",
                                  description:
                                    "Keep writing to the member's own address instead.",
                                },
                              ]}
                            />
                          </FieldSet>
                        )}
                      </workspaceForm.Field>
                    </FieldGroup>
                  </form>

                  {workspaceFormError ? (
                    <Alert variant="destructive" className="mt-6">
                      <CircleAlertIcon />
                      <AlertTitle>Could not save Workspace settings</AlertTitle>
                      <AlertDescription>{workspaceFormError}</AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
                <CardFooter className="justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    You can fine-tune all of this later in administration.
                  </p>
                  <Button
                    onClick={() => void workspaceForm.handleSubmit()}
                    disabled={saveWorkspaceConfig.isPending}
                  >
                    Save and continue
                  </Button>
                </CardFooter>
              </Card>
            ) : null}

            {currentStep === "organization" ? (
              <Card className="bg-card/95">
                <CardHeader>
                  <CardTitle>
                    Step {stepNumber("organization")} · Describe the
                    organization
                  </CardTitle>
                  <CardDescription>
                    Identity and contact details for the organization this
                    deployment is being set up for.
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
                          admin
                          {createAdminAsMember
                            ? " and added to the organization's membership."
                            : ", without being added to the organization's membership."}
                        </span>
                      ) : (
                        <span>Finish the admin step before continuing.</span>
                      )}
                    </AlertDescription>
                  </Alert>

                  {state.workspaceModuleEnabled ? (
                    <Alert>
                      <Building2Icon />
                      <AlertTitle>
                        Google Workspace module will be enabled
                      </AlertTitle>
                      <AlertDescription>
                        {state.workspaceDomain ? (
                          <span>
                            The module will be activated on{" "}
                            <strong>{state.workspaceDomain}</strong>. Connecting
                            your Google admin account is the next and final
                            step.
                          </span>
                        ) : (
                          <span>
                            The module will be activated on this organization.
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                  ) : null}

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
                                organizationBootstrapWithMembershipSchema.shape
                                  .organizationName,
                                value,
                              ),
                            onSubmit: ({ value }) =>
                              readZodFieldError(
                                organizationBootstrapWithMembershipSchema.shape
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
                                organizationBootstrapWithMembershipSchema.shape
                                  .organizationSlug,
                                value,
                              ),
                            onSubmit: ({ value }) =>
                              readZodFieldError(
                                organizationBootstrapWithMembershipSchema.shape
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
                                organizationBootstrapWithMembershipSchema.shape
                                  .legalName,
                                value,
                              ),
                            onSubmit: ({ value }) =>
                              readZodFieldError(
                                organizationBootstrapWithMembershipSchema.shape
                                  .legalName,
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
                                organizationBootstrapWithMembershipSchema.shape
                                  .primaryEmail,
                                value,
                              ),
                            onSubmit: ({ value }) =>
                              readZodFieldError(
                                organizationBootstrapWithMembershipSchema.shape
                                  .primaryEmail,
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
                              organizationBootstrapWithMembershipSchema.shape
                                .website,
                              value,
                            ),
                          onSubmit: ({ value }) =>
                            readZodFieldError(
                              organizationBootstrapWithMembershipSchema.shape
                                .website,
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
                                  aria-invalid={showErrors && errors.length > 0}
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
                    Nothing is written to the database yet — membership comes
                    next.
                  </p>
                  <Button
                    onClick={() => void submitOrganizationProfile()}
                    disabled={saveOrgProfile.isPending}
                  >
                    Save and continue
                  </Button>
                </CardFooter>
              </Card>
            ) : null}

            {currentStep === "membership" ? (
              <Card className="bg-card/95">
                <CardHeader>
                  <CardTitle>
                    Step {stepNumber("membership")} · Set up membership
                  </CardTitle>
                  <CardDescription>
                    Decide how memberships work for{" "}
                    {state.organizationName ?? "your organization"}. Everything
                    here can be changed later in administration.{" "}
                    {state.workspaceModuleEnabled
                      ? "Saving creates the organization, then you'll connect Google Workspace to finish."
                      : "Saving creates the organization and completes setup."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="flex flex-col gap-6"
                    onSubmit={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void organizationForm.handleSubmit();
                    }}
                  >

                    <FieldSet>
                      <FieldLegend>Management mode</FieldLegend>
                      <organizationForm.Field name="membershipManagementMode">
                        {(field) => (
                          <RadioChoiceGroup
                            idPrefix="setup-membership-mode"
                            className="w-full"
                            value={field.state.value}
                            onValueChange={field.handleChange}
                            options={membershipManagementModeOptions.map(
                              (option) => ({
                                value: option.value,
                                title: option.label,
                                description: option.description,
                              }),
                            )}
                          />
                        )}
                      </organizationForm.Field>
                    </FieldSet>

                    <organizationForm.Subscribe
                      selector={(s) =>
                        s.values.membershipManagementMode ===
                        "periodic_renewal"
                      }
                    >
                      {(isPeriodicRenewal) =>
                        isPeriodicRenewal ? (
                          <div className="flex flex-col gap-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <organizationForm.Field
                                name="membershipRenewalMonth"
                                validators={{
                                  onChange: ({ value }) =>
                                    value == null
                                      ? "Renewal month is required for periodic renewal."
                                      : undefined,
                                }}
                              >
                                {(field) => {
                                  const errors = toFieldErrors(
                                    field.state.meta.errors,
                                    organizationServerFieldErrors.membershipRenewalMonth,
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
                                      <FieldLabel>Renewal month</FieldLabel>
                                      <FieldContent>
                                        <Select
                                          value={
                                            field.state.value?.toString() ??
                                            ""
                                          }
                                          onValueChange={(v) => {
                                            clearOrganizationFieldError(
                                              "membershipRenewalMonth",
                                            );
                                            field.handleChange(
                                              v ? Number(v) : null,
                                            );
                                          }}
                                        >
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select month" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {MONTH_LABELS.map(
                                              (label, i) => (
                                                <SelectItem
                                                  key={i + 1}
                                                  value={(i + 1).toString()}
                                                >
                                                  {label}
                                                </SelectItem>
                                              ),
                                            )}
                                          </SelectContent>
                                        </Select>
                                        {showErrors ? (
                                          <FieldError errors={errors} />
                                        ) : null}
                                      </FieldContent>
                                    </Field>
                                  );
                                }}
                              </organizationForm.Field>

                              <organizationForm.Field
                                name="membershipRenewalDay"
                                validators={{
                                  onChange: ({ value }) =>
                                    value == null
                                      ? "Renewal day is required for periodic renewal."
                                      : undefined,
                                }}
                              >
                                {(field) => {
                                  const errors = toFieldErrors(
                                    field.state.meta.errors,
                                    organizationServerFieldErrors.membershipRenewalDay,
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
                                      <FieldLabel>Renewal day</FieldLabel>
                                      <FieldContent>
                                        <Input
                                          type="number"
                                          min={1}
                                          max={31}
                                          placeholder="1–31"
                                          value={field.state.value ?? ""}
                                          onBlur={field.handleBlur}
                                          onChange={(e) => {
                                            clearOrganizationFieldError(
                                              "membershipRenewalDay",
                                            );
                                            const n = parseInt(
                                              e.target.value,
                                              10,
                                            );
                                            field.handleChange(
                                              isNaN(n) ? null : n,
                                            );
                                          }}
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

                            <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background/70 px-4 py-3">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium">
                                  Require fee payment
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  Members will receive a payment request
                                  during the renewal period.
                                </span>
                              </div>
                              <organizationForm.Field name="membershipFeeEnabled">
                                {(field) => (
                                  <Switch
                                    checked={field.state.value}
                                    onCheckedChange={(checked) => {
                                      field.handleChange(checked);
                                    }}
                                  />
                                )}
                              </organizationForm.Field>
                            </div>

                            <organizationForm.Subscribe
                              selector={(s) =>
                                s.values.membershipFeeEnabled
                              }
                            >
                              {(feeEnabled) =>
                                feeEnabled ? (
                                  <div className="grid gap-4 md:grid-cols-2">
                                    <organizationForm.Field
                                      name="membershipFeeAmount"
                                      validators={{
                                        onBlur: ({ value }) =>
                                          value == null
                                            ? "Fee amount is required when fee payment is enabled."
                                            : undefined,
                                      }}
                                    >
                                      {(field) => {
                                        const errors = toFieldErrors(
                                          field.state.meta.errors,
                                          organizationServerFieldErrors.membershipFeeAmount,
                                        );
                                        const showErrors =
                                          field.state.meta.isTouched ||
                                          field.form.state
                                            .submissionAttempts > 0;

                                        return (
                                          <Field
                                            data-invalid={
                                              showErrors &&
                                              errors.length > 0
                                            }
                                          >
                                            <FieldLabel>
                                              Fee amount
                                            </FieldLabel>
                                            <FieldContent>
                                              <Input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                placeholder="e.g. 500"
                                                value={
                                                  field.state.value ?? ""
                                                }
                                                onBlur={field.handleBlur}
                                                onChange={(e) => {
                                                  clearOrganizationFieldError(
                                                    "membershipFeeAmount",
                                                  );
                                                  const n = parseFloat(
                                                    e.target.value,
                                                  );
                                                  field.handleChange(
                                                    isNaN(n) ? null : n,
                                                  );
                                                }}
                                              />
                                              <FieldDescription>
                                                Whole units (e.g. 500 for
                                                500 CZK).
                                              </FieldDescription>
                                              {showErrors ? (
                                                <FieldError
                                                  errors={errors}
                                                />
                                              ) : null}
                                            </FieldContent>
                                          </Field>
                                        );
                                      }}
                                    </organizationForm.Field>

                                    <organizationForm.Field name="membershipFeeCurrency">
                                      {(field) => (
                                        <Field>
                                          <FieldLabel>Currency</FieldLabel>
                                          <FieldContent>
                                            <Select
                                              value={field.state.value}
                                              onValueChange={(v) =>
                                                field.handleChange(v)
                                              }
                                            >
                                              <SelectTrigger>
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {feeCurrencyOptions.map(
                                                  (opt) => (
                                                    <SelectItem
                                                      key={opt.value}
                                                      value={opt.value}
                                                    >
                                                      {opt.label}
                                                    </SelectItem>
                                                  ),
                                                )}
                                              </SelectContent>
                                            </Select>
                                          </FieldContent>
                                        </Field>
                                      )}
                                    </organizationForm.Field>

                                    <organizationForm.Field
                                      name="membershipFeeBankAccount"
                                      validators={{
                                        onBlur: ({ value }) =>
                                          value != null &&
                                          typeof value === "string" &&
                                          value.trim().length > 0 &&
                                          value.trim().length < 5
                                            ? "Enter a valid bank account or IBAN."
                                            : undefined,
                                      }}
                                    >
                                      {(field) => {
                                        const errors = toFieldErrors(
                                          field.state.meta.errors,
                                          organizationServerFieldErrors.membershipFeeBankAccount,
                                        );
                                        const showErrors =
                                          field.state.meta.isTouched ||
                                          field.form.state
                                            .submissionAttempts > 0;

                                        return (
                                          <Field
                                            className="md:col-span-2"
                                            data-invalid={
                                              showErrors &&
                                              errors.length > 0
                                            }
                                          >
                                            <FieldLabel>
                                              Bank account (IBAN)
                                            </FieldLabel>
                                            <FieldContent>
                                              <Input
                                                placeholder="CZ65 0800 0000 1920 0014 5399"
                                                value={
                                                  (field.state
                                                    .value as string) ?? ""
                                                }
                                                onBlur={field.handleBlur}
                                                onChange={(e) => {
                                                  clearOrganizationFieldError(
                                                    "membershipFeeBankAccount",
                                                  );
                                                  field.handleChange(
                                                    e.target.value || null,
                                                  );
                                                }}
                                              />
                                              {showErrors ? (
                                                <FieldError
                                                  errors={errors}
                                                />
                                              ) : null}
                                            </FieldContent>
                                          </Field>
                                        );
                                      }}
                                    </organizationForm.Field>

                                    <organizationForm.Field name="membershipFeePaymentWindowDays">
                                      {(field) => (
                                        <Field>
                                          <FieldLabel>
                                            Payment window (days)
                                          </FieldLabel>
                                          <FieldContent>
                                            <Input
                                              type="number"
                                              min={1}
                                              max={365}
                                              value={field.state.value}
                                              onBlur={field.handleBlur}
                                              onChange={(e) => {
                                                const n = parseInt(
                                                  e.target.value,
                                                  10,
                                                );
                                                field.handleChange(
                                                  isNaN(n) ? 30 : n,
                                                );
                                              }}
                                            />
                                            <FieldDescription>
                                              Days after the renewal date
                                              before payment is considered
                                              overdue.
                                            </FieldDescription>
                                          </FieldContent>
                                        </Field>
                                      )}
                                    </organizationForm.Field>
                                  </div>
                                ) : null
                              }
                            </organizationForm.Subscribe>
                          </div>
                        ) : null
                      }
                    </organizationForm.Subscribe>
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
                  <Button
                    variant="outline"
                    onClick={() => editOrgProfile.execute({})}
                    disabled={editOrgProfile.isPending}
                  >
                    Back to organization
                  </Button>
                  <Button
                    type="submit"
                    onClick={() => void organizationForm.handleSubmit()}
                    disabled={createOrg.isPending}
                  >
                    {createOrg.isPending
                      ? "Creating organization…"
                      : state.workspaceModuleEnabled
                        ? "Create organization and continue"
                        : "Create organization and finish setup"}
                  </Button>
                </CardFooter>
              </Card>
            ) : null}

            {currentStep === "connect" && workspaceConnectState ? (
              <Card className="bg-card/95">
                <CardHeader>
                  <CardTitle>
                    Step {stepNumber("connect")} · Connect Google Workspace
                  </CardTitle>
                  <CardDescription>
                    Your organization is created. Grant Spoleek access to your
                    Google Workspace directory so it can provision member
                    accounts, then decide which fields it fills in.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  {workspaceCallbackStatus === "error" ? (
                    <Alert variant="destructive">
                      <CircleAlertIcon />
                      <AlertTitle>Connection failed</AlertTitle>
                      <AlertDescription>
                        {decodeWorkspaceMessage(workspaceCallbackMessage)}
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {workspaceConnectState.connected ? (
                    <>
                      <Alert>
                        <CheckIcon />
                        <AlertTitle>Google Workspace connected</AlertTitle>
                        <AlertDescription>
                          Connected as{" "}
                          <strong>
                            {workspaceConnectState.adminEmail ??
                              "a super-admin"}
                          </strong>{" "}
                          on{" "}
                          <strong>{workspaceConnectState.domain}</strong>.
                        </AlertDescription>
                      </Alert>

                      <WorkspaceProvisionFields
                        fields={provisionFields}
                        onFieldsChange={setProvisionFields}
                        customFields={workspaceConnectState.customFields}
                        groupCategories={[]}
                        description="Pick what Spoleek writes onto a member's Workspace account when it is created — during approval, import, or manual creation."
                        footnote={
                          <>
                            Nothing here is final: you can change which fields
                            are filled, and what fills them, any time under
                            Settings → Workspace. More auto-fill sources appear
                            as your organization takes shape — once you add
                            group categories, a field can be derived from the
                            member&apos;s group name with a template like{" "}
                            <code>{"{name}"}</code>, and any custom member
                            fields you define become sources too. Only the org
                            unit and member profile options are available this
                            early, because nothing else exists yet.
                          </>
                        }
                      />
                    </>
                  ) : (
                    <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-background/70 p-4">
                      <p className="text-sm font-medium">
                        Connect as a Workspace super-admin
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Spoleek needs the <code>admin.directory.user</code>{" "}
                        scope to create accounts on{" "}
                        <strong>
                          {workspaceConnectState.domain ?? "your domain"}
                        </strong>
                        . You will come straight back here afterwards.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="self-start"
                        onClick={() => {
                          window.location.href =
                            "/api/workspace/oauth/start?origin=setup";
                        }}
                      >
                        <LinkIcon data-icon="inline-start" />
                        Connect Google Workspace
                        <ExternalLinkIcon data-icon="inline-end" />
                      </Button>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="justify-between gap-4">
                  <Button
                    variant="ghost"
                    onClick={() => void finishSetup(false)}
                    disabled={completeSetup.isPending}
                  >
                    {workspaceConnectState.connected
                      ? "Skip field setup"
                      : "Skip for now"}
                  </Button>
                  <Button
                    onClick={() =>
                      void finishSetup(workspaceConnectState.connected)
                    }
                    disabled={
                      completeSetup.isPending || saveProvisionFields.isPending
                    }
                  >
                    Go to administration
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

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
