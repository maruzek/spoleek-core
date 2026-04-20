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
};

export const setupStepOrder = [
  "intent",
  "environment",
  "readiness",
  "admin",
  "organization",
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
