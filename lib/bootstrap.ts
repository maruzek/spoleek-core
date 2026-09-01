export const setupDeploymentTracks = [
  "local-docker",
  "vps-docker",
  "vercel-neon",
] as const;

export const setupAuthStrategies = [
  "email-password",
  "email-password-google",
  "google-first",
] as const;

export type SetupDeploymentTrack = (typeof setupDeploymentTracks)[number];
export type SetupAuthStrategy = (typeof setupAuthStrategies)[number];

export const setupCookieName = "spoleek_first_run_setup";

export type SetupWizardCookieState = {
  deploymentTrack?: SetupDeploymentTrack;
  authStrategy?: SetupAuthStrategy;
  workspaceModuleEnabled?: boolean;
  envGuidanceAccepted?: boolean;
  envValidated?: boolean;
  adminUserId?: string;
  adminEmail?: string;
  workspaceDomain?: string;
  workspaceEmailTemplate?: string;
  workspaceDefaultEmailPreference?: "personal" | "workspace";
  workspaceConfigured?: boolean;
  organizationName?: string;
  organizationSlug?: string;
  legalName?: string;
  primaryEmail?: string;
  website?: string;
  organizationProfileSaved?: boolean;
  /**
   * Whether the first admin also gets a tenant_members row. Admin powers come
   * from users.systemRole, so opting out only decides org membership.
   */
  createAdminAsMember?: boolean;
  /**
   * Set once the organization row exists. The Workspace OAuth grant needs a real
   * orgId, so the wizard keeps running past org creation to finish the connection.
   */
  organizationId?: string;
};

export const setupStepOrder = [
  "intent",
  "environment",
  "readiness",
  "admin",
  "workspace",
  "organization",
  "membership",
  "connect",
] as const;

export type SetupStep = (typeof setupStepOrder)[number];

export const deploymentTrackLabels: Record<SetupDeploymentTrack, string> = {
  "local-docker": "Local Docker",
  "vps-docker": "VPS Docker",
  "vercel-neon": "Vercel + Neon",
};

export const authStrategyLabels: Record<SetupAuthStrategy, string> = {
  "email-password": "Email and password",
  "email-password-google": "Email/password + Google",
  "google-first": "Google-first",
};

/**
 * The Workspace-only steps are skipped entirely unless the Workspace module was
 * picked during the intent step.
 */
export function getSetupStepsFor(workspaceModuleEnabled: boolean): SetupStep[] {
  return setupStepOrder.filter((step) =>
    step === "workspace" || step === "connect" ? workspaceModuleEnabled : true,
  );
}

/**
 * Consumer Google domains never back a Workspace directory, so they must not be
 * suggested as the org's workspace domain.
 */
const CONSUMER_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
]);

/**
 * Best guess at the Workspace domain from the first admin's Google address.
 * Returns null when the address cannot stand in for a Workspace domain, in
 * which case the admin types it themselves.
 */
export function deriveWorkspaceDomainFromEmail(
  email: string | null | undefined,
): string | null {
  const domain = email?.trim().toLowerCase().split("@")[1];

  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return null;
  }

  return CONSUMER_EMAIL_DOMAINS.has(domain) ? null : domain;
}
