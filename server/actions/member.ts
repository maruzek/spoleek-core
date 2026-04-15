"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

import { authActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import { tenantMembers } from "@/server/db/schema";
import { getAppOrganization, getOrganizationPolicy } from "@/server/queries/app";
import {
  findShadowMemberForUser,
  getTenantMemberByUserId,
} from "@/server/queries/members";

const joinSchema = z.object({
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  acceptTerms: z
    .boolean()
    .refine((value) => value, "You must accept the organization terms."),
  acceptPrivacy: z
    .boolean()
    .refine((value) => value, "You must accept the privacy policy."),
});

export const joinOrganizationAction = authActionClient
  .metadata({ actionName: "joinOrganization" })
  .inputSchema(joinSchema)
  .action(async ({ parsedInput, ctx }) => {
    const organization = await getAppOrganization();

    if (!organization) {
      throw new Error("The application is not set up yet.");
    }

    const policy = await getOrganizationPolicy(organization.id);

    if (!policy) {
      throw new Error("Organization policy setup is incomplete.");
    }

    const existing = await getTenantMemberByUserId(organization.id, ctx.auth.user.id);
    const shadow = await findShadowMemberForUser(
      organization.id,
      ctx.auth.user.email,
    );

    const patch = {
      phone: parsedInput.phone || null,
      addressLine1: parsedInput.addressLine1 || null,
      city: parsedInput.city || null,
      postalCode: parsedInput.postalCode || null,
      acceptedTermsAt: new Date(),
      acceptedPrivacyAt: new Date(),
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(tenantMembers)
        .set({
          ...patch,
          fullName: existing.fullName || ctx.auth.user.name,
          email: ctx.auth.user.email,
          status: existing.status === "active" ? "active" : "pending",
        })
        .where(eq(tenantMembers.id, existing.id));

      return { success: true, status: existing.status };
    }

    if (shadow) {
      await db
        .update(tenantMembers)
        .set({
          ...patch,
          userId: ctx.auth.user.id,
          fullName: shadow.fullName || ctx.auth.user.name,
          email: ctx.auth.user.email,
          linkedAt: new Date(),
          status: shadow.status === "active" ? "active" : "pending",
        })
        .where(eq(tenantMembers.id, shadow.id));

      return { success: true, status: shadow.status };
    }

    await db.insert(tenantMembers).values({
      id: randomUUID(),
      orgId: organization.id,
      userId: ctx.auth.user.id,
      email: ctx.auth.user.email,
      fullName: ctx.auth.user.name,
      role: "member",
      status: "pending",
      linkedAt: new Date(),
      ...patch,
    });

    return {
      success: true,
      status: "pending" as const,
    };
  });

const profileSchema = z.object({
  fullName: z.string().min(2, "Full name is required."),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string().min(2).max(2).default("CZ"),
});

export const updateProfileAction = authActionClient
  .metadata({ actionName: "updateProfile" })
  .inputSchema(profileSchema)
  .action(async ({ parsedInput, ctx }) => {
    const organization = await getAppOrganization();

    if (!organization) {
      throw new Error("The application is not set up yet.");
    }

    const member = await getTenantMemberByUserId(organization.id, ctx.auth.user.id);

    if (!member) {
      returnValidationErrors(profileSchema, {
        fullName: {
          _errors: ["Join the organization before updating your profile."],
        },
      });
    }

    await db
      .update(tenantMembers)
      .set({
        fullName: parsedInput.fullName,
        phone: parsedInput.phone || null,
        addressLine1: parsedInput.addressLine1 || null,
        addressLine2: parsedInput.addressLine2 || null,
        city: parsedInput.city || null,
        postalCode: parsedInput.postalCode || null,
        countryCode: parsedInput.countryCode,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantMembers.orgId, organization.id),
          eq(tenantMembers.userId, ctx.auth.user.id),
        ),
      );

    return {
      success: true,
    };
  });
