"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

import {
  setupAuthStrategies,
  setupDeploymentTracks,
  type SetupAuthStrategy,
  type SetupWizardCookieState,
} from "@/lib/bootstrap";
import {
  emailAdminSchema,
  organizationBootstrapSchema,
  organizationBootstrapWithMembershipSchema,
  setupWorkspaceConfigSchema,
} from "@/lib/bootstrap/setup-schemas";
import { buildAbsoluteAppUrl } from "@/lib/auth/urls";
import { splitMemberName } from "@/lib/member-custom-fields";
import { feeToMinorUnits } from "@/lib/payments";
import { actionClient } from "@/lib/safe-action";
import { slugify } from "@/lib/slugify";
import { defaultLocale } from "@/lib/i18n";
import { seedOrganizationPolicies } from "@/server/lib/policy-seed";
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
  authStrategy: z.enum([...setupAuthStrategies, "google-workspace"] as const),
});

export const saveSetupIntentAction = actionClient
  .metadata({ actionName: "saveSetupIntent" })
  .inputSchema(setupIntentSchema)
  .action(async ({ parsedInput }) => {
    const bootstrapState = await getBootstrapState();

    if (bootstrapState.hasOrganization) {
      throw new Error("Setup is already complete for this deployment.");
    }

    const isWorkspace = parsedInput.authStrategy === "google-workspace";
    const resolvedAuthStrategy: SetupAuthStrategy = isWorkspace
      ? "google-first"
      : (parsedInput.authStrategy as SetupAuthStrategy);
    const nextState: SetupWizardCookieState = {
      deploymentTrack: parsedInput.deploymentTrack,
      authStrategy: resolvedAuthStrategy,
      workspaceModuleEnabled: isWorkspace,
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

export const saveSetupWorkspaceConfigAction = actionClient
  .metadata({ actionName: "saveSetupWorkspaceConfig" })
  .inputSchema(setupWorkspaceConfigSchema)
  .action(async ({ parsedInput }) => {
    const [bootstrapState, state] = await Promise.all([
      getBootstrapState(),
      getSetupWizardState(),
    ]);

    if (bootstrapState.hasOrganization) {
      throw new Error("Setup is already complete for this deployment.");
    }

    if (!state.envValidated || !state.adminUserId) {
      throw new Error("Finish the admin setup steps first.");
    }

    if (!state.workspaceModuleEnabled) {
      throw new Error("The Workspace module is not part of this setup path.");
    }

    await setSetupWizardState({
      ...state,
      workspaceDomain: parsedInput.workspaceDomain,
      workspaceEmailTemplate: parsedInput.workspaceEmailTemplate,
      workspaceDefaultEmailPreference: parsedInput.defaultEmailPreference,
      workspaceConfigured: true,
    });

    return { success: true };
  });

export const setSetupAdminMembershipAction = actionClient
  .metadata({ actionName: "setSetupAdminMembership" })
  .inputSchema(z.object({ createAdminAsMember: z.boolean() }))
  .action(async ({ parsedInput }) => {
    const state = await getSetupWizardState();

    if (state.organizationId) {
      throw new Error("The organization has already been created.");
    }

    await setSetupWizardState({
      ...state,
      createAdminAsMember: parsedInput.createAdminAsMember,
    });

    return { success: true };
  });

export const saveSetupOrganizationProfileAction = actionClient
  .metadata({ actionName: "saveSetupOrganizationProfile" })
  .inputSchema(organizationBootstrapSchema)
  .action(async ({ parsedInput }) => {
    const [bootstrapState, state] = await Promise.all([
      getBootstrapState(),
      getSetupWizardState(),
    ]);

    if (bootstrapState.hasOrganization) {
      throw new Error("Setup is already complete for this deployment.");
    }

    if (!state.envValidated || !state.adminUserId) {
      throw new Error("Finish the admin setup steps first.");
    }

    const slug = slugify(parsedInput.organizationSlug);
    const [{ db }, { organizations }] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
    ]);
    const [duplicateSlug] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    // Caught here rather than at creation so the admin fixes it on the step
    // that owns the field.
    if (duplicateSlug) {
      returnValidationErrors(organizationBootstrapSchema, {
        organizationSlug: {
          _errors: ["That organization slug is already in use."],
        },
      });
    }

    await setSetupWizardState({
      ...state,
      organizationName: parsedInput.organizationName,
      organizationSlug: slug,
      legalName: parsedInput.legalName,
      primaryEmail: parsedInput.primaryEmail,
      website: parsedInput.website || undefined,
      organizationProfileSaved: true,
    });

    return { success: true };
  });

/** Sends the wizard back to the organization profile step. */
export const editSetupOrganizationProfileAction = actionClient
  .metadata({ actionName: "editSetupOrganizationProfile" })
  .inputSchema(z.object({}))
  .action(async () => {
    const state = await getSetupWizardState();

    if (state.organizationId) {
      throw new Error("The organization has already been created.");
    }

    await setSetupWizardState({ ...state, organizationProfileSaved: false });

    return { success: true };
  });

/**
 * Ends the wizard once the Workspace connect step is done or skipped. The
 * organization already exists at this point, so this only drops the cookie.
 */
export const completeSetupAction = actionClient
  .metadata({ actionName: "completeSetup" })
  .inputSchema(z.object({}))
  .action(async () => {
    await clearSetupWizardState();

    return { success: true };
  });

export const createBootstrapOrganizationAction = actionClient
  .metadata({ actionName: "createBootstrapOrganization" })
  .inputSchema(organizationBootstrapWithMembershipSchema)
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
      returnValidationErrors(organizationBootstrapWithMembershipSchema, {
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

    const adminName = splitMemberName(session.user.name);
    const isPeriodicRenewal =
      parsedInput.membershipManagementMode === "periodic_renewal";

    let orgId: string;

    await db.transaction(async (tx) => {
      const [org] = await tx.insert(organizations).values({
        slug,
        name: parsedInput.organizationName,
        legalName: parsedInput.legalName,
        primaryEmail: parsedInput.primaryEmail,
        website: parsedInput.website || null,
        setupDeploymentTrack: state.deploymentTrack,
        setupAuthStrategy: state.authStrategy,
        onboardingCompletedAt: new Date(),
        workspaceModuleEnabled: state.workspaceModuleEnabled ?? false,
        workspaceDomain: state.workspaceDomain ?? null,
        ...(state.workspaceEmailTemplate
          ? { workspaceEmailTemplate: state.workspaceEmailTemplate }
          : {}),
        defaultEmailPreference:
          state.workspaceDefaultEmailPreference ?? "personal",
        membershipManagementMode: parsedInput.membershipManagementMode,
        membershipRenewalMonth: isPeriodicRenewal
          ? parsedInput.membershipRenewalMonth
          : null,
        membershipRenewalDay: isPeriodicRenewal
          ? parsedInput.membershipRenewalDay
          : null,
        membershipFeeEnabled: isPeriodicRenewal
          ? parsedInput.membershipFeeEnabled
          : false,
        membershipFeeAmount:
          isPeriodicRenewal && parsedInput.membershipFeeEnabled
            ? feeToMinorUnits(parsedInput.membershipFeeAmount ?? 0)
            : null,
        membershipFeeCurrency: parsedInput.membershipFeeCurrency,
        membershipFeeBankAccount:
          isPeriodicRenewal && parsedInput.membershipFeeEnabled
            ? parsedInput.membershipFeeBankAccount
            : null,
        membershipFeePaymentWindowDays:
          isPeriodicRenewal && parsedInput.membershipFeeEnabled
            ? parsedInput.membershipFeePaymentWindowDays
            : 30,
      }).returning({ id: organizations.id });

      orgId = org!.id;

      await tx.insert(organizationPolicies).values({ orgId });

      await seedOrganizationPolicies(tx, {
        orgId,
        organizationName: parsedInput.organizationName,
        locale: defaultLocale,
      });

      await tx
        .update(users)
        .set({
          systemRole: "system_admin",
          updatedAt: new Date(),
        })
        .where(eq(users.id, session.user.id));

      const isWorkspace = state.workspaceModuleEnabled ?? false;
      // Admin access comes from users.systemRole above, so skipping this only
      // keeps the admin out of the organization's membership.
      const createAdminAsMember = state.createAdminAsMember ?? true;

      if (!createAdminAsMember) {
        return;
      }

      if (!existingMembership) {
        await tx.insert(tenantMembers).values({
          orgId,
          userId: session.user.id,
          email: isWorkspace ? null : session.user.email,
          workspaceUserEmail: isWorkspace ? session.user.email : null,
          firstName: adminName.firstName,
          lastName: adminName.lastName,
          role: "org_admin",
          status: "active",
          // No consent stamped: at first-run there are no published policy
          // versions to acknowledge yet.
          linkedAt: new Date(),
        });
      } else {
        await tx
          .update(tenantMembers)
          .set({
            orgId,
            email: isWorkspace ? null : (existingMembership.email ?? session.user.email),
            workspaceUserEmail: isWorkspace ? session.user.email : null,
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

    if (state.workspaceModuleEnabled) {
      // The OAuth grant needs a real orgId, so the wizard stays open for the
      // connect step instead of handing over to /admin straight away.
      await setSetupWizardState({ ...state, organizationId: orgId! });
    } else {
      await clearSetupWizardState();
    }

    return {
      success: true,
      orgId: orgId!,
      workspaceModuleEnabled: state.workspaceModuleEnabled ?? false,
    };
  });
