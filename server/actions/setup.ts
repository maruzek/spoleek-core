"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

import { actionClient } from "@/lib/safe-action";
import { splitMemberName } from "@/lib/member-custom-fields";
import { authActionClient, orgAdminActionClient } from "@/lib/safe-action-auth";
import { slugify } from "@/lib/slugify";
import { db } from "@/server/db";
import {
  organizationPolicies,
  organizations,
  tenantMembers,
  users,
} from "@/server/db/schema";

const setupSchema = z.object({
  organizationName: z.string().min(2, "Organization name is required."),
  organizationSlug: z
    .string()
    .min(2, "Slug is required.")
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens."),
  legalName: z.string().min(2, "Legal name is required."),
  primaryEmail: z.email("Enter a valid organization email."),
  website: z.union([z.literal(""), z.url("Enter a valid website URL.")]).optional(),
  termsLabel: z.string().min(5, "Terms label is required."),
  termsText: z.string().min(20, "Add the initial terms text."),
  privacyLabel: z.string().min(5, "Privacy label is required."),
  privacyText: z.string().min(20, "Add the initial privacy policy text."),
});

export const createOrganizationSetupAction = authActionClient
  .metadata({ actionName: "createOrganizationSetup" })
  .inputSchema(setupSchema)
  .action(async ({ parsedInput, ctx }) => {
    const existing = await db.select().from(organizations).limit(1);

    if (existing.length > 0) {
      throw new Error("This deployment has already been set up.");
    }

    const slug = slugify(parsedInput.organizationSlug);
    const duplicateSlug = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (duplicateSlug.length > 0) {
      returnValidationErrors(setupSchema, {
        organizationSlug: {
          _errors: ["That organization slug is already in use."],
        },
      });
    }

    const orgId = randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(organizations).values({
        id: orgId,
        slug,
        name: parsedInput.organizationName,
        legalName: parsedInput.legalName,
        primaryEmail: parsedInput.primaryEmail,
        website: parsedInput.website || null,
        onboardingCompletedAt: new Date(),
      });

      await tx.insert(organizationPolicies).values({
        id: randomUUID(),
        orgId,
        termsOfServiceLabel: parsedInput.termsLabel,
        termsOfServiceText: parsedInput.termsText,
        privacyPolicyLabel: parsedInput.privacyLabel,
        privacyPolicyText: parsedInput.privacyText,
        version: "v1",
      });

      await tx
        .update(users)
        .set({
          systemRole: "system_admin",
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.auth.user.id));

      const existingMembership = await tx
        .select()
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.orgId, orgId),
            eq(tenantMembers.userId, ctx.auth.user.id),
          ),
        )
        .limit(1);

      if (existingMembership.length === 0) {
        const adminName = splitMemberName(ctx.auth.user.name);

        await tx.insert(tenantMembers).values({
          id: randomUUID(),
          orgId,
          userId: ctx.auth.user.id,
          email: ctx.auth.user.email,
          firstName: adminName.firstName,
          lastName: adminName.lastName,
          fullName: ctx.auth.user.name,
          role: "org_admin",
          status: "active",
          acceptedTermsAt: new Date(),
          acceptedPrivacyAt: new Date(),
          linkedAt: new Date(),
        });
      }
    });

    return {
      success: true,
      orgId,
    };
  });

export const bootstrapDemoOrganizationAction = actionClient
  .metadata({ actionName: "bootstrapDemoOrganization" })
  .inputSchema(z.object({}))
  .action(async () => {
    return {
      ok: true,
    };
  });

export const createShadowMemberAction = orgAdminActionClient
  .metadata({ actionName: "createShadowMember" })
  .inputSchema(
    z.object({
      fullName: z.string().min(2, "Member name is required."),
      email: z.union([z.literal(""), z.email("Enter a valid email.")]).optional(),
      phone: z.string().optional(),
      notes: z.string().optional(),
      role: z.enum(["member", "leader", "org_admin"]).default("member"),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { requireOrganization } = await import("@/server/queries/access");
    const { findUserByEmail } = await import("@/server/queries/members");

    const organization = await requireOrganization();
    const matchedUser =
      parsedInput.email && parsedInput.email.length > 0
        ? await findUserByEmail(parsedInput.email)
        : null;
    const memberName = splitMemberName(parsedInput.fullName);

    await db.insert(tenantMembers).values({
      id: randomUUID(),
      orgId: organization.id,
      userId: matchedUser?.id ?? null,
      email: parsedInput.email || null,
      firstName: memberName.firstName,
      lastName: memberName.lastName,
      fullName: parsedInput.fullName,
      phone: parsedInput.phone || null,
      notes: parsedInput.notes || null,
      role: parsedInput.role,
      status: "active",
      linkedAt: matchedUser ? new Date() : null,
      acceptedTermsAt: matchedUser ? new Date() : null,
      acceptedPrivacyAt: matchedUser ? new Date() : null,
    });

    return {
      success: true,
      createdBy: ctx.auth.user.email,
    };
  });

export const approveMemberAction = orgAdminActionClient
  .metadata({ actionName: "approveMember" })
  .inputSchema(
    z.object({
      memberId: z.string().uuid(),
      role: z.enum(["member", "leader", "org_admin"]).default("member"),
    }),
  )
  .action(async ({ parsedInput }) => {
    const { requireOrganization } = await import("@/server/queries/access");
    const organization = await requireOrganization();

    await db
      .update(tenantMembers)
      .set({
        role: parsedInput.role,
        status: "active",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantMembers.id, parsedInput.memberId),
          eq(tenantMembers.orgId, organization.id),
        ),
      );

    return { success: true };
  });
