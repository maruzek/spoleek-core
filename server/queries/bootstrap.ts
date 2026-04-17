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
  envGuidanceAccepted: z.boolean().optional(),
  envValidated: z.boolean().optional(),
  adminUserId: z.string().optional(),
  adminEmail: z.string().optional(),
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

export async function getSetupWizardState(): Promise<SetupWizardCookieState> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(setupCookieName)?.value;

  if (!raw) {
    return {};
  }

  try {
    return setupCookieSchema.parse(JSON.parse(raw));
  } catch {
    return {};
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

  return "organization";
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
    return [...base, "RESEND_API_KEY", "RESEND_FROM_EMAIL"];
  }

  if (authStrategy === "email-password-google") {
    return [
      ...base,
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "RESEND_API_KEY",
      "RESEND_FROM_EMAIL",
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
