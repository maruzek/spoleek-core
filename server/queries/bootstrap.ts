import { headers } from "next/headers";
import { cookies } from "next/headers";
import { Pool } from "pg";
import { z } from "zod";

import {
  authStrategyLabels,
  deploymentTrackLabels,
  setupAuthStrategies,
  setupCookieName,
  setupDeploymentTracks,
  type SetupAuthStrategy,
  type SetupDeploymentTrack,
  type SetupStep,
  type SetupWizardCookieState,
} from "@/lib/bootstrap";
import { getRawServerEnv } from "@/lib/env";

const setupCookieSchema = z.object({
  deploymentTrack: z.enum(setupDeploymentTracks).optional(),
  authStrategy: z.enum(setupAuthStrategies).optional(),
  workspaceModuleEnabled: z.boolean().optional(),
  envGuidanceAccepted: z.boolean().optional(),
  envValidated: z.boolean().optional(),
  adminUserId: z.string().optional(),
  adminEmail: z.string().optional(),
  workspaceDomain: z.string().optional(),
  workspaceEmailTemplate: z.string().optional(),
  workspaceDefaultEmailPreference: z.enum(["personal", "workspace"]).optional(),
  workspaceConfigured: z.boolean().optional(),
  organizationName: z.string().optional(),
  organizationSlug: z.string().optional(),
  legalName: z.string().optional(),
  primaryEmail: z.string().optional(),
  website: z.string().optional(),
  organizationProfileSaved: z.boolean().optional(),
  createAdminAsMember: z.boolean().optional(),
  organizationId: z.string().optional(),
});

export type BootstrapState = Awaited<ReturnType<typeof getBootstrapState>>;

export type SetupEnvIssue = {
  key: string;
  message: string;
  severity: "error" | "warning";
};

export type SetupEnvReadiness = {
  canAdvance: boolean;
  issues: SetupEnvIssue[];
  requiredKeys: string[];
  googleEnabledByChoice: boolean;
  databaseConnectionOk: boolean;
};

export async function getBootstrapState() {
  try {
    const [{ db }, { organizations }] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
    ]);
    const [organization] = await db.select().from(organizations).limit(1);

    return {
      hasOrganization: Boolean(organization),
      organization: organization ?? null,
      databaseIssue: null as string | null,
    };
  } catch (error) {
    return {
      hasOrganization: false,
      organization: null,
      databaseIssue:
        error instanceof Error ? error.message : "Unable to query bootstrap state.",
    };
  }
}

/**
 * The deployment track pinned by `DEPLOYMENT_MODE`, or null when the env file
 * leaves the choice open.
 *
 * Read from the raw env rather than `getServerEnv()` on purpose: the wizard's
 * whole job is to run while the environment is still incomplete, and
 * `getServerEnv()` throws in exactly that case.
 */
export function getEnvDeploymentMode(): SetupDeploymentTrack | null {
  const value = getRawServerEnv().DEPLOYMENT_MODE?.trim();

  return value && (setupDeploymentTracks as readonly string[]).includes(value)
    ? (value as SetupDeploymentTrack)
    : null;
}

export async function getSetupWizardState(): Promise<SetupWizardCookieState> {
  const envDeploymentMode = getEnvDeploymentMode();
  const cookieStore = await cookies();
  const raw = cookieStore.get(setupCookieName)?.value;

  if (!raw) {
    return envDeploymentMode ? { deploymentTrack: envDeploymentMode } : {};
  }

  try {
    const parsed = setupCookieSchema.parse(JSON.parse(raw));

    // Env wins over the cookie, always. A stale cookie from before the variable
    // was set must not be able to run the rest of setup against the wrong track.
    return envDeploymentMode
      ? { ...parsed, deploymentTrack: envDeploymentMode }
      : parsed;
  } catch {
    return envDeploymentMode ? { deploymentTrack: envDeploymentMode } : {};
  }
}

export async function setSetupWizardState(nextState: SetupWizardCookieState) {
  const cookieStore = await cookies();
  cookieStore.set(setupCookieName, JSON.stringify(nextState), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

export async function clearSetupWizardState() {
  const cookieStore = await cookies();
  cookieStore.delete(setupCookieName);
}

export function deriveSetupStep(
  state: SetupWizardCookieState,
  opts?: { hasAdminSession?: boolean },
): SetupStep {
  // The organization exists, so only the Workspace OAuth grant is left.
  if (state.organizationId) {
    return "connect";
  }

  if (!state.deploymentTrack || !state.authStrategy) {
    return "intent";
  }

  if (!state.envGuidanceAccepted) {
    return "environment";
  }

  if (!state.envValidated) {
    return "readiness";
  }

  if (!state.adminUserId || !opts?.hasAdminSession) {
    return "admin";
  }

  if (state.workspaceModuleEnabled && !state.workspaceConfigured) {
    return "workspace";
  }

  if (!state.organizationProfileSaved) {
    return "organization";
  }

  return "membership";
}

/**
 * Connect-step data. Only reachable once the org row exists, so it can read the
 * live connection state instead of the setup cookie.
 */
export async function getSetupWorkspaceConnectState(orgId: string) {
  const [{ db }, { eq }, { organizations, workspaceConnections, memberCustomFields }] =
    await Promise.all([
      import("@/server/db"),
      import("drizzle-orm"),
      import("@/server/db/schema"),
    ]);

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!organization) {
    return null;
  }

  const [connection] = await db
    .select({ id: workspaceConnections.id, revokedAt: workspaceConnections.revokedAt })
    .from(workspaceConnections)
    .where(eq(workspaceConnections.orgId, orgId))
    .limit(1);

  const customFields = await db
    .select({ key: memberCustomFields.key, label: memberCustomFields.label })
    .from(memberCustomFields)
    .where(eq(memberCustomFields.orgId, orgId));

  return {
    connected: Boolean(connection && !connection.revokedAt),
    domain: organization.workspaceDomain,
    emailTemplate: organization.workspaceEmailTemplate,
    adminEmail: organization.workspaceAdminEmail,
    provisionFields: organization.workspaceProvisionFields ?? [],
    customFields,
  };
}

export function getSetupInstructions(
  deploymentTrack: SetupDeploymentTrack,
  authStrategy: SetupAuthStrategy,
) {
  const requiredKeys = getRequiredEnvKeys(authStrategy);
  const emailInviteEnabled = authStrategy !== "google-first";

  const deploymentInstructions: Record<
    SetupDeploymentTrack,
    { title: string; command: string; details: string[] }
  > = {
    "local-docker": {
      title: "Local Docker",
      command: "docker compose up -d db adminer",
      details: [
        "Use the local Postgres container from compose for development.",
        "Make sure DATABASE_URL matches the compose credentials and exposed port.",
        "After the container is healthy, run the Drizzle migration command.",
      ],
    },
    "vps-docker": {
      title: "VPS Docker",
      command: "docker compose up -d",
      details: [
        "Prepare production env vars before starting the stack on the VPS.",
        "Use a strong DATABASE_URL password and durable volume storage.",
        "Point APP_URL and BETTER_AUTH_URL to the final public hostname.",
      ],
    },
    "vercel-neon": {
      title: "Vercel + Neon",
      command: "Set env vars in Vercel, then provision the Neon database URL.",
      details: [
        "Use the hosted Postgres connection string from Neon.",
        "APP_URL and BETTER_AUTH_URL should use the deployed app origin.",
        "Configure Google callback URLs against the deployed domain when Google is enabled.",
      ],
    },
  };

  return {
    deploymentLabel: deploymentTrackLabels[deploymentTrack],
    authLabel: authStrategyLabels[authStrategy],
    requiredKeys,
    deployment: deploymentInstructions[deploymentTrack],
    envSnippet: [
      "APP_URL=http://localhost:3000",
      "DATABASE_URL=postgres://spoleek_admin:password@localhost:5432/spoleek",
      "BETTER_AUTH_URL=http://localhost:3000",
      "BETTER_AUTH_SECRET=replace-with-a-long-random-secret-at-least-32-chars",
      "APP_ENCRYPTION_KEY=replace-with-a-long-random-key-at-least-32-chars",
      "DEFAULT_LOCALE=en",
      "WORKSPACE_SYNC_ENABLED=false",
      authStrategy === "email-password"
        ? "GOOGLE_CLIENT_ID="
        : "GOOGLE_CLIENT_ID=your-google-client-id",
      authStrategy === "email-password"
        ? "GOOGLE_CLIENT_SECRET="
        : "GOOGLE_CLIENT_SECRET=your-google-client-secret",
      emailInviteEnabled ? "RESEND_API_KEY=re_xxxxxxxxx" : "RESEND_API_KEY=",
      emailInviteEnabled ? "RESEND_FROM_EMAIL=onboarding@example.com" : "RESEND_FROM_EMAIL=",
      emailInviteEnabled ? "RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxx" : "RESEND_WEBHOOK_SECRET=",
      "SMTP_FROM=optional-fallback@example.com",
    ].join("\n"),
  };
}

export async function getSetupEnvReadiness(
  state: SetupWizardCookieState,
): Promise<SetupEnvReadiness> {
  if (!state.authStrategy) {
    return {
      canAdvance: false,
      issues: [
        {
          key: "authStrategy",
          message: "Choose an authentication strategy first.",
          severity: "error",
        },
      ],
      requiredKeys: [],
      googleEnabledByChoice: false,
      databaseConnectionOk: false,
    };
  }

  const raw = getRawServerEnv();
  const requiredKeys = getRequiredEnvKeys(state.authStrategy);
  const issues: SetupEnvIssue[] = [];

  for (const key of requiredKeys) {
    const value = raw[key as keyof typeof raw];

    if (typeof value !== "string" || value.trim().length === 0) {
      issues.push({
        key,
        message: `${key} is required for the selected setup path.`,
        severity: "error",
      });
      continue;
    }

    if (
      ["APP_URL", "DATABASE_URL", "BETTER_AUTH_URL"].includes(key) &&
      !isValidUrl(value)
    ) {
      issues.push({
        key,
        message: `${key} must be a valid URL.`,
        severity: "error",
      });
    }

    if (
      ["BETTER_AUTH_SECRET", "APP_ENCRYPTION_KEY"].includes(key) &&
      value.trim().length < 32
    ) {
      issues.push({
        key,
        message: `${key} must be at least 32 characters long.`,
        severity: "error",
      });
    }
  }

  if (
    raw.SMTP_FROM &&
    raw.SMTP_FROM.trim().length > 0 &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.SMTP_FROM.trim())
  ) {
    issues.push({
      key: "SMTP_FROM",
      message: "SMTP_FROM must be a valid email address or be left blank.",
      severity: "warning",
    });
  }

  if (
    raw.RESEND_FROM_EMAIL &&
    raw.RESEND_FROM_EMAIL.trim().length > 0 &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.RESEND_FROM_EMAIL.trim())
  ) {
    issues.push({
      key: "RESEND_FROM_EMAIL",
      message: "RESEND_FROM_EMAIL must be a valid email address.",
      severity: "error",
    });
  }

  let databaseConnectionOk = false;

  if (!issues.some((issue) => issue.key === "DATABASE_URL")) {
    const pool = new Pool({
      connectionString: raw.DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 1_000,
      connectionTimeoutMillis: 1_500,
    });

    try {
      await pool.query("select 1");
      databaseConnectionOk = true;
    } catch (error) {
      issues.push({
        key: "DATABASE_URL",
        message:
          error instanceof Error
            ? `Database connection failed: ${error.message}`
            : "Database connection failed.",
        severity: "error",
      });
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  return {
    canAdvance:
      issues.filter((issue) => issue.severity === "error").length === 0 &&
      databaseConnectionOk,
    issues,
    requiredKeys,
    googleEnabledByChoice: state.authStrategy !== "email-password",
    databaseConnectionOk,
  };
}

export async function getSetupViewerSessionSafe() {
  try {
    const [{ auth }, requestHeaders] = await Promise.all([
      import("@/lib/auth/auth"),
      headers(),
    ]);

    return await auth.api.getSession({
      headers: requestHeaders,
    });
  } catch {
    return null;
  }
}

function getRequiredEnvKeys(authStrategy: SetupAuthStrategy) {
  const base = [
    "APP_URL",
    "DATABASE_URL",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_SECRET",
    "APP_ENCRYPTION_KEY",
    "DEFAULT_LOCALE",
    "WORKSPACE_SYNC_ENABLED",
  ];

  if (authStrategy === "email-password") {
    return [...base, "RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_WEBHOOK_SECRET"];
  }

  if (authStrategy === "email-password-google") {
    return [
      ...base,
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "RESEND_API_KEY",
      "RESEND_FROM_EMAIL",
      "RESEND_WEBHOOK_SECRET",
    ];
  }

  return [...base, "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
