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
import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { splitMemberName } from "@/lib/member-custom-fields";
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
    const existingUser = await auth.$context.then((context) =>
      context.internalAdapter.findUserByEmail(parsedInput.email.trim().toLowerCase()),
    );

    if (existingUser?.user) {
      returnValidationErrors(emailAdminSchema, {
        email: {
          _errors: ["That email is already in use."],
        },
      });
    }

    const context = await auth.$context;
    const now = new Date();
    const userId = context.generateId({ model: "user" }) || randomUUID();
    const user = await context.internalAdapter.createUser({
      id: userId,
      name: parsedInput.name.trim(),
      email: parsedInput.email.trim().toLowerCase(),
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    });

    if (!user) {
      throw new Error("Unable to create the first admin account.");
    }

    const passwordHash = await context.password.hash(parsedInput.password);

    await context.internalAdapter.linkAccount({
      accountId: user.id,
      providerId: "credential",
      password: passwordHash,
      userId: user.id,
    });

    const signInResult = await auth.api.signInEmail({
      body: {
        email: user.email,
        password: parsedInput.password,
        callbackURL: buildAbsoluteAppUrl("/setup"),
      },
      headers: await headers(),
    });

    if (!signInResult?.user?.id) {
      throw new Error("The first admin account was created, but automatic sign-in failed.");
    }

    await setSetupWizardState({
      ...state,
      adminUserId: user.id,
      adminEmail: user.email,
    });

    return {
      success: true,
      email: user.email,
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
    const adminName = splitMemberName(session.user.name);

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
          firstName: adminName.firstName,
          lastName: adminName.lastName,
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
            firstName: existingMembership.firstName || adminName.firstName,
            lastName: existingMembership.lastName || adminName.lastName,
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
