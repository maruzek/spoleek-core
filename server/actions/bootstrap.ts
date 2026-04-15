"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

import {
  setupAuthStrategies,
  setupDeploymentTracks,
  type SetupWizardCookieState,
} from "@/lib/bootstrap";
import {
  emailAdminSchema,
  organizationBootstrapSchema,
} from "@/lib/bootstrap/setup-schemas";
import { actionClient } from "@/lib/safe-action";
import { slugify } from "@/lib/slugify";
import {
  clearSetupWizardState,
  getBootstrapState,
  getSetupEnvReadiness,
  getSetupViewerSessionSafe,
  getSetupWizardState,
  setSetupWizardState,
} from "@/server/queries/bootstrap";

const setupIntentSchema = z.object({
  deploymentTrack: z.enum(setupDeploymentTracks),
  authStrategy: z.enum(setupAuthStrategies),
});

export const saveSetupIntentAction = actionClient
  .metadata({ actionName: "saveSetupIntent" })
  .inputSchema(setupIntentSchema)
  .action(async ({ parsedInput }) => {
    const bootstrapState = await getBootstrapState();

    if (bootstrapState.hasOrganization) {
      throw new Error("Setup is already complete for this deployment.");
    }

    const nextState: SetupWizardCookieState = {
      deploymentTrack: parsedInput.deploymentTrack,
      authStrategy: parsedInput.authStrategy,
      envGuidanceAccepted: false,
      envValidated: false,
    };

    await setSetupWizardState(nextState);

    return {
      success: true,
    };
  });

export const advanceSetupEnvironmentAction = actionClient
  .metadata({ actionName: "advanceSetupEnvironment" })
  .inputSchema(z.object({}))
  .action(async () => {
    const state = await getSetupWizardState();

    if (!state.deploymentTrack || !state.authStrategy) {
      throw new Error("Choose a setup path first.");
    }

    await setSetupWizardState({
      ...state,
      envGuidanceAccepted: true,
      envValidated: false,
      adminUserId: undefined,
      adminEmail: undefined,
    });

    return {
      success: true,
    };
  });

export const validateSetupEnvironmentAction = actionClient
  .metadata({ actionName: "validateSetupEnvironment" })
  .inputSchema(z.object({}))
  .action(async () => {
    const state = await getSetupWizardState();
    const readiness = await getSetupEnvReadiness(state);

    if (readiness.canAdvance) {
      await setSetupWizardState({
        ...state,
        envValidated: true,
      });
    }

    return {
      success: readiness.canAdvance,
      readiness,
    };
  });

export const resetSetupWizardAction = actionClient
  .metadata({ actionName: "resetSetupWizard" })
  .inputSchema(z.object({}))
  .action(async () => {
    await clearSetupWizardState();

    return { success: true };
  });

export const createSetupEmailAdminAction = actionClient
  .metadata({ actionName: "createSetupEmailAdmin" })
  .inputSchema(emailAdminSchema)
  .action(async ({ parsedInput }) => {
    const [bootstrapState, state] = await Promise.all([
      getBootstrapState(),
      getSetupWizardState(),
    ]);

    if (bootstrapState.hasOrganization) {
      throw new Error("Setup is already complete for this deployment.");
    }

    if (!state.envValidated) {
      throw new Error("Finish the environment readiness step first.");
    }

    if (state.authStrategy === "google-first") {
      throw new Error("Google-first setup must use the Google account flow.");
    }

    const { auth } = await import("@/lib/auth/auth");
    const { headers } = await import("next/headers");

    const result = await auth.api.signUpEmail({
      body: {
        name: parsedInput.name,
        email: parsedInput.email,
        password: parsedInput.password,
        callbackURL: "/setup",
      },
      headers: await headers(),
    });

    if (!result?.user?.id) {
      throw new Error("Unable to create the first admin account.");
    }

    await setSetupWizardState({
      ...state,
      adminUserId: result.user.id,
      adminEmail: result.user.email,
    });

    return {
      success: true,
      email: result.user.email,
    };
  });

export const claimSetupSessionAdminAction = actionClient
  .metadata({ actionName: "claimSetupSessionAdmin" })
  .inputSchema(z.object({}))
  .action(async () => {
    const [bootstrapState, state, session] = await Promise.all([
      getBootstrapState(),
      getSetupWizardState(),
      getSetupViewerSessionSafe(),
    ]);

    if (bootstrapState.hasOrganization) {
      throw new Error("Setup is already complete for this deployment.");
    }

    if (!state.envValidated) {
      throw new Error("Finish the environment readiness step first.");
    }

    if (!session) {
      throw new Error("Sign in with the chosen provider before continuing.");
    }

    await setSetupWizardState({
      ...state,
      adminUserId: session.user.id,
      adminEmail: session.user.email,
    });

    return {
      success: true,
      email: session.user.email,
    };
  });

export const createBootstrapOrganizationAction = actionClient
  .metadata({ actionName: "createBootstrapOrganization" })
  .inputSchema(organizationBootstrapSchema)
  .action(async ({ parsedInput }) => {
    const [bootstrapState, state, session] = await Promise.all([
      getBootstrapState(),
      getSetupWizardState(),
      getSetupViewerSessionSafe(),
    ]);

    if (bootstrapState.hasOrganization) {
      throw new Error("Setup is already complete for this deployment.");
    }

    if (!state.envValidated || !state.adminUserId) {
      throw new Error("Finish the admin setup steps first.");
    }

    if (!session || session.user.id !== state.adminUserId) {
      throw new Error("Continue setup with the first admin account you created.");
    }

    const slug = slugify(parsedInput.organizationSlug);
    const [
      { db },
      { organizationPolicies, organizations, tenantMembers, users },
    ] = await Promise.all([import("@/server/db"), import("@/server/db/schema")]);
    const duplicateSlug = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (duplicateSlug.length > 0) {
      returnValidationErrors(organizationBootstrapSchema, {
        organizationSlug: {
          _errors: ["That organization slug is already in use."],
        },
      });
    }

    const [existingMembership] = await db
      .select()
      .from(tenantMembers)
      .where(eq(tenantMembers.userId, session.user.id))
      .limit(1);

    const orgId = randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(organizations).values({
        id: orgId,
        slug,
        name: parsedInput.organizationName,
        legalName: parsedInput.legalName,
        primaryEmail: parsedInput.primaryEmail,
        website: parsedInput.website || null,
        setupDeploymentTrack: state.deploymentTrack,
        setupAuthStrategy: state.authStrategy,
        onboardingCompletedAt: new Date(),
      });

      await tx.insert(organizationPolicies).values({
        id: randomUUID(),
        orgId,
        termsOfServiceLabel: `I agree to ${parsedInput.organizationName}'s terms of service.`,
        termsOfServiceText: `${parsedInput.organizationName} terms of service placeholder. Replace this in administration after first login.`,
        privacyPolicyLabel: `I agree to ${parsedInput.organizationName}'s privacy policy.`,
        privacyPolicyText: `${parsedInput.organizationName} privacy policy placeholder. Replace this in administration after first login.`,
        version: "v1",
      });

      await tx
        .update(users)
        .set({
          systemRole: "system_admin",
          updatedAt: new Date(),
        })
        .where(eq(users.id, session.user.id));

      if (!existingMembership) {
        await tx.insert(tenantMembers).values({
          id: randomUUID(),
          orgId,
          userId: session.user.id,
          email: session.user.email,
          fullName: session.user.name,
          role: "org_admin",
          status: "active",
          acceptedTermsAt: new Date(),
          acceptedPrivacyAt: new Date(),
          linkedAt: new Date(),
        });
      } else {
        await tx
          .update(tenantMembers)
          .set({
            orgId,
            role: "org_admin",
            status: "active",
            linkedAt: existingMembership.linkedAt ?? new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tenantMembers.id, existingMembership.id),
              eq(tenantMembers.userId, session.user.id),
            ),
          );
      }
    });

    await clearSetupWizardState();

    return {
      success: true,
      orgId,
    };
  });
