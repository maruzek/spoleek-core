"use server";

import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

import { submissionIdentityOf } from "@/lib/events/responder";
import { validateQuestionLink } from "@/lib/forms/profile-sync";
import {
  attachFormToEventSchema,
  createFormSchema,
  deleteSubmissionSchema,
  formIdSchema,
  sendFormReminderEmailsSchema,
  setFormAudienceSchema,
  setFormQuestionsSchema,
  setFormStatusSchema,
  submitFormAsGuestSchema,
  submitFormForMemberSchema,
  submitFormSchema,
  submitFormWithTokenSchema,
  updateFormSettingsSchema,
  type FormQuestionInput,
  type FormSettingsInput,
} from "@/lib/forms/schemas";
import { pickConstraintsForType } from "@/lib/member-custom-field-constraints";
import { actionClient } from "@/lib/safe-action";
import { authActionClient } from "@/lib/safe-action-auth";
import { db } from "@/server/db";
import {
  formAudience,
  formQuestions,
  formSubmissions,
  forms,
  memberCustomFields,
  tenantMembers,
  type MemberCustomField,
} from "@/server/db/schema";
import { touchRsvpToken } from "@/server/lib/events/tokens";
import { FormError, persistSubmission } from "@/server/lib/forms/submissions";
import { sanitizePolicyHtml } from "@/server/lib/policy-html";
import { consumeRateLimit, getRequestIdentifier } from "@/server/lib/rate-limit";
import { sendFormReminders } from "@/server/notifications/forms";
import {
  requireCurrentMember,
  requireEventManagementAccess,
  requireFormAttachAccess,
  requireFormManagementAccess,
  requireFormOwnerAccess,
  requireGroupAdminModuleAccess,
  requireOrganization,
} from "@/server/queries/access";
import { getEventBySlug } from "@/server/queries/events";
import {
  buildMemberIdentity,
  getFormById,
  getFormEvent,
  getGuestRsvpAnswer,
  listFormPending,
  listFormQuestions,
  loadLiveFields,
} from "@/server/queries/forms";
import { listActiveMemberCustomFields } from "@/server/queries/member-custom-fields";
import { getResponderResponse, resolveTokenResponder } from "@/server/queries/responder";

// ─── Helpers ────────────────────────────────────────────────────────────────

function ownerIdOf(input: Pick<FormSettingsInput, "ownerType" | "ownerCategoryId" | "ownerGroupId">) {
  if (input.ownerType === "group") return input.ownerGroupId ?? null;
  if (input.ownerType === "category") return input.ownerCategoryId ?? null;
  return null;
}

function settingsColumns(input: FormSettingsInput) {
  return {
    title: input.title.trim(),
    description: input.description ?? null,
    ownerType: input.ownerType,
    ownerCategoryId: input.ownerType === "category" ? input.ownerCategoryId ?? null : null,
    ownerGroupId: input.ownerType === "group" ? input.ownerGroupId ?? null : null,
    timing: input.timing,
    required: input.required,
    onlyRsvpYes: input.onlyRsvpYes,
    closesAt: input.closesAt ?? null,
    visibility: input.visibility,
  };
}

/**
 * The row an incoming question becomes. A linked question snapshots the live
 * field's type / options / constraints so it keeps working if the field is
 * deleted later; the link itself is validated by the caller.
 */
function questionColumns(
  input: FormQuestionInput,
  sortOrder: number,
  liveField: MemberCustomField | null,
) {
  const descriptionHtml = input.descriptionHtml ? sanitizePolicyHtml(input.descriptionHtml) : null;

  if (input.kind === "section") {
    return {
      sortOrder,
      kind: "section" as const,
      label: input.label,
      descriptionHtml,
      type: null,
      options: [] as string[],
      constraints: {},
      required: false,
      memberFieldId: null,
      profileSync: "none" as const,
      sensitivity: "normal" as const,
      art9Condition: null,
      processingPurpose: null,
      valueVisibility: "member_managers" as const,
      shredAfterEventDays: null,
    };
  }

  const type = liveField?.type ?? input.type;
  const special = input.sensitivity === "special_category";
  return {
    sortOrder,
    kind: "input" as const,
    label: input.label,
    descriptionHtml,
    type,
    options: liveField ? liveField.options : input.options,
    constraints: liveField
      ? liveField.constraints
      : pickConstraintsForType(type, input.constraints),
    required: input.required,
    memberFieldId: liveField?.id ?? null,
    profileSync: liveField ? input.profileSync : ("none" as const),
    sensitivity: input.sensitivity,
    art9Condition: special ? input.art9Condition ?? null : null,
    processingPurpose: special ? input.processingPurpose ?? null : null,
    valueVisibility: input.valueVisibility,
    shredAfterEventDays: input.shredAfterEventDays,
  };
}

async function copyQuestions(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orgId: string,
  fromFormId: string,
  toFormId: string,
) {
  const source = await tx
    .select()
    .from(formQuestions)
    .where(and(eq(formQuestions.orgId, orgId), eq(formQuestions.formId, fromFormId)));
  if (source.length === 0) return;
  await tx.insert(formQuestions).values(
    source.map((question) => ({
      orgId,
      formId: toFormId,
      sortOrder: question.sortOrder,
      kind: question.kind,
      label: question.label,
      descriptionHtml: question.descriptionHtml,
      type: question.type,
      options: question.options,
      constraints: question.constraints,
      required: question.required,
      memberFieldId: question.memberFieldId,
      profileSync: question.profileSync,
      sensitivity: question.sensitivity,
      art9Condition: question.art9Condition,
      processingPurpose: question.processingPurpose,
      valueVisibility: question.valueVisibility,
      shredAfterEventDays: question.shredAfterEventDays,
    })),
  );
}

/** Turns `INVALID_ANSWERS` into per-question validation errors under `answers`. */
function rethrowAnswers(
  schema:
    | typeof submitFormSchema
    | typeof submitFormWithTokenSchema
    | typeof submitFormAsGuestSchema
    | typeof submitFormForMemberSchema,
  error: unknown,
): never {
  if (error instanceof FormError && error.code === "INVALID_ANSWERS") {
    returnValidationErrors(schema, {
      answers: Object.fromEntries(
        Object.entries(error.details).map(([id, message]) => [id, { _errors: [message] }]),
      ),
    } as never);
  }
  throw error;
}

// ─── Management ─────────────────────────────────────────────────────────────

export const createFormAction = authActionClient
  .metadata({ actionName: "createForm" })
  .inputSchema(createFormSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { settings } = parsedInput;
    const context = parsedInput.asTemplate
      ? await requireGroupAdminModuleAccess(ctx.viewer)
      : await requireFormOwnerAccess(ctx.viewer, settings.ownerType, ownerIdOf(settings));
    const orgId = context.organization.id;

    if (parsedInput.asTemplate && !context.capabilities.canManageOrganization) {
      throw new FormError("TEMPLATE_READ_ONLY");
    }

    if (parsedInput.eventId && !parsedInput.asTemplate) {
      await requireEventManagementAccess(ctx.viewer, parsedInput.eventId);
    }

    let template: { id: string } | null = null;
    if (parsedInput.fromTemplateId) {
      // Read access to a template is any manager's.
      const { form } = await requireFormManagementAccess(ctx.viewer, parsedInput.fromTemplateId);
      if (!form.isTemplate) throw new FormError("NOT_FOUND");
      template = { id: form.id };
    }

    const formId = await db.transaction(async (tx) => {
      const [form] = await tx
        .insert(forms)
        .values({
          orgId,
          ...settingsColumns(settings),
          ...(parsedInput.asTemplate
            ? { isTemplate: true, ownerType: "organization" as const, ownerCategoryId: null, ownerGroupId: null, eventId: null }
            : { eventId: parsedInput.eventId ?? null }),
          createdByUserId: ctx.auth.user.id,
        })
        .returning({ id: forms.id });

      if (template) await copyQuestions(tx, orgId, template.id, form!.id);
      return form!.id;
    });

    return { success: true as const, formId };
  });

export const updateFormSettingsAction = authActionClient
  .metadata({ actionName: "updateFormSettings" })
  .inputSchema(updateFormSettingsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { form } = await requireFormManagementAccess(ctx.viewer, parsedInput.formId, { write: true });
    const { settings } = parsedInput;

    // Templates stay org-owned; the CHECK would reject anything else anyway.
    if (form.isTemplate && settings.ownerType !== "organization") {
      throw new FormError("TEMPLATE_READ_ONLY");
    }

    const ownerChanged =
      form.ownerType !== settings.ownerType ||
      (form.ownerType === "group" ? form.ownerGroupId : form.ownerCategoryId) !==
        ownerIdOf(settings);
    if (ownerChanged) {
      await requireFormOwnerAccess(ctx.viewer, settings.ownerType, ownerIdOf(settings));
    }

    await db.update(forms).set(settingsColumns(settings)).where(eq(forms.id, form.id));

    return { success: true as const };
  });

export const setFormStatusAction = authActionClient
  .metadata({ actionName: "setFormStatus" })
  .inputSchema(setFormStatusSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { form } = await requireFormManagementAccess(ctx.viewer, parsedInput.formId, { write: true });
    if (form.isTemplate) throw new FormError("TEMPLATE_READ_ONLY");
    await db.update(forms).set({ status: parsedInput.status }).where(eq(forms.id, form.id));
    return { success: true as const };
  });

export const deleteFormAction = authActionClient
  .metadata({ actionName: "deleteForm" })
  .inputSchema(formIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { form } = await requireFormManagementAccess(ctx.viewer, parsedInput.formId, { write: true });
    await db.update(forms).set({ deletedAt: new Date() }).where(eq(forms.id, form.id));
    return { success: true as const };
  });

export const attachFormToEventAction = authActionClient
  .metadata({ actionName: "attachFormToEvent" })
  .inputSchema(attachFormToEventSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { form, event } = await requireFormAttachAccess(ctx.viewer, parsedInput.formId, parsedInput.eventId);
    if (form.isTemplate) throw new FormError("TEMPLATE_READ_ONLY");
    await db.update(forms).set({ eventId: event.id }).where(eq(forms.id, form.id));
    return { success: true as const };
  });

export const detachFormFromEventAction = authActionClient
  .metadata({ actionName: "detachFormFromEvent" })
  .inputSchema(formIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { form } = await requireFormManagementAccess(ctx.viewer, parsedInput.formId, { write: true });
    if (!form.eventId) return { success: true as const };
    await requireFormAttachAccess(ctx.viewer, form.id, form.eventId);
    await db.update(forms).set({ eventId: null, onlyRsvpYes: false }).where(eq(forms.id, form.id));
    return { success: true as const };
  });

/** An org-owned copy with `isTemplate`; questions copied, audience and status not. */
export const saveFormAsTemplateAction = authActionClient
  .metadata({ actionName: "saveFormAsTemplate" })
  .inputSchema(formIdSchema.extend({ title: z.string().trim().min(2).max(200).optional() }))
  .action(async ({ parsedInput, ctx }) => {
    const { context, form } = await requireFormManagementAccess(ctx.viewer, parsedInput.formId);
    const orgId = context.organization.id;

    const templateId = await db.transaction(async (tx) => {
      const [template] = await tx
        .insert(forms)
        .values({
          orgId,
          title: parsedInput.title ?? form.title,
          description: form.description,
          isTemplate: true,
          ownerType: "organization",
          timing: form.timing,
          required: form.required,
          onlyRsvpYes: form.onlyRsvpYes,
          visibility: form.visibility,
          createdByUserId: ctx.auth.user.id,
        })
        .returning({ id: forms.id });
      await copyQuestions(tx, orgId, form.id, template!.id);
      return template!.id;
    });

    return { success: true as const, formId: templateId };
  });

/** A draft copy of a form (or template) with the same owner; questions copied. */
export const duplicateFormAction = authActionClient
  .metadata({ actionName: "duplicateForm" })
  .inputSchema(formIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { context, form } = await requireFormManagementAccess(ctx.viewer, parsedInput.formId);
    const orgId = context.organization.id;

    const copyId = await db.transaction(async (tx) => {
      const [copy] = await tx
        .insert(forms)
        .values({
          orgId,
          title: `${form.title} (copy)`,
          description: form.description,
          isTemplate: form.isTemplate,
          ownerType: form.ownerType,
          ownerCategoryId: form.ownerCategoryId,
          ownerGroupId: form.ownerGroupId,
          eventId: form.eventId,
          timing: form.timing,
          required: form.required,
          onlyRsvpYes: form.onlyRsvpYes,
          closesAt: form.closesAt,
          visibility: form.visibility,
          createdByUserId: ctx.auth.user.id,
        })
        .returning({ id: forms.id });
      await copyQuestions(tx, orgId, form.id, copy!.id);
      return copy!.id;
    });

    return { success: true as const, formId: copyId };
  });

/** Active, member-facing custom fields the builder may link a question to. */
export const loadLinkableFieldsAction = authActionClient
  .metadata({ actionName: "loadLinkableFields" })
  .inputSchema(z.object({}))
  .action(async ({ ctx }) => {
    const context = await requireGroupAdminModuleAccess(ctx.viewer);
    const fields = await listActiveMemberCustomFields(context.organization.id);
    return {
      fields: fields
        .filter((field) => field.stage !== "admin_only" && field.sensitivity === "normal")
        .map((field) => ({
          id: field.id,
          key: field.key,
          label: field.label,
          type: field.type,
          options: field.options,
          constraints: field.constraints,
        })),
    };
  });

/**
 * Replaces the full ordered list in one transaction. Existing ids are
 * updated in place so answers survive an edit; ids that are gone are deleted
 * and their answers cascade. Every link is validated before the first write.
 */
export const setFormQuestionsAction = authActionClient
  .metadata({ actionName: "setFormQuestions" })
  .inputSchema(setFormQuestionsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { context, form } = await requireFormManagementAccess(ctx.viewer, parsedInput.formId, { write: true });
    const orgId = context.organization.id;

    const linkedIds = [
      ...new Set(
        parsedInput.questions
          .map((q) => (q.kind === "input" ? q.memberFieldId : null))
          .filter((id): id is string => !!id),
      ),
    ];
    const fieldRows =
      linkedIds.length > 0
        ? await db
            .select()
            .from(memberCustomFields)
            .where(and(eq(memberCustomFields.orgId, orgId), inArray(memberCustomFields.id, linkedIds)))
        : [];
    const fieldById = new Map(fieldRows.map((row) => [row.id, row]));

    const linkErrors: Record<number, { memberFieldId: { _errors: string[] } }> = {};
    parsedInput.questions.forEach((question, index) => {
      if (question.kind !== "input" || !question.memberFieldId) return;
      const reason = validateQuestionLink(
        { sensitivity: question.sensitivity, type: null },
        fieldById.get(question.memberFieldId) ?? null,
      );
      if (reason) {
        linkErrors[index] = { memberFieldId: { _errors: [`QUESTION_LINK_INVALID:${reason}`] } };
      }
    });
    if (Object.keys(linkErrors).length > 0) {
      returnValidationErrors(setFormQuestionsSchema, { questions: linkErrors });
    }

    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: formQuestions.id })
        .from(formQuestions)
        .where(eq(formQuestions.formId, form.id));
      const existingIds = new Set(existing.map((row) => row.id));

      const keptIds: string[] = [];
      for (const [index, question] of parsedInput.questions.entries()) {
        const liveField =
          question.kind === "input" && question.memberFieldId
            ? fieldById.get(question.memberFieldId) ?? null
            : null;
        const columns = questionColumns(question, index, liveField);

        if (question.id && existingIds.has(question.id)) {
          await tx.update(formQuestions).set(columns).where(eq(formQuestions.id, question.id));
          keptIds.push(question.id);
        } else {
          const [inserted] = await tx
            .insert(formQuestions)
            .values({ orgId, formId: form.id, ...columns })
            .returning({ id: formQuestions.id });
          keptIds.push(inserted!.id);
        }
      }

      await tx
        .delete(formQuestions)
        .where(
          keptIds.length > 0
            ? and(eq(formQuestions.formId, form.id), notInArray(formQuestions.id, keptIds))
            : eq(formQuestions.formId, form.id),
        );
    });

    return { success: true as const };
  });

/** Replaces the rule list. Only read for unlinked, targeted forms. */
export const setFormAudienceAction = authActionClient
  .metadata({ actionName: "setFormAudience" })
  .inputSchema(setFormAudienceSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { context, form } = await requireFormManagementAccess(ctx.viewer, parsedInput.formId, { write: true });
    const orgId = context.organization.id;

    await db.transaction(async (tx) => {
      await tx.delete(formAudience).where(eq(formAudience.formId, form.id));

      const rows = parsedInput.rules.map((rule) => ({
        orgId,
        formId: form.id,
        kind: rule.kind,
        groupId: rule.kind === "group" ? rule.groupId : null,
        categoryId: rule.kind === "category" ? rule.categoryId : null,
        memberId: rule.kind === "member" ? rule.memberId : null,
        scope: rule.kind === "member" ? ("members" as const) : rule.scope,
      }));

      if (rows.length > 0) {
        await tx.insert(formAudience).values(rows).onConflictDoNothing();
      }
    });

    return { success: true as const };
  });

/** A manager typing in a submission (or editing one) for a member or a guest. */
export const submitFormForMemberAction = authActionClient
  .metadata({ actionName: "submitFormForMember" })
  .inputSchema(submitFormForMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { context, form } = await requireFormManagementAccess(ctx.viewer, parsedInput.formId, { write: true });
    const orgId = context.organization.id;
    if (form.isTemplate) throw new FormError("TEMPLATE_READ_ONLY");

    const [event, questions] = await Promise.all([
      getFormEvent(orgId, form),
      listFormQuestions(orgId, form.id),
    ]);
    const liveFieldsById = await loadLiveFields(orgId, questions);

    let identity;
    if (parsedInput.memberId) {
      const [member] = await db
        .select({ id: tenantMembers.id })
        .from(tenantMembers)
        .where(
          and(
            eq(tenantMembers.orgId, orgId),
            eq(tenantMembers.id, parsedInput.memberId),
            isNull(tenantMembers.deletedAt),
          ),
        )
        .limit(1);
      if (!member) throw new FormError("NOT_FOUND");
      identity = await buildMemberIdentity(orgId, form, event, member.id);
    } else {
      // Guests only exist on events; an unlinked form has no guest channel.
      if (!event) throw new FormError("NOT_ELIGIBLE");
      identity = {
        kind: "guest" as const,
        guestEmail: parsedInput.guestEmail!,
        guestName: parsedInput.guestName ?? parsedInput.guestEmail!,
        rsvpAnswer: await getGuestRsvpAnswer(orgId, event.id, parsedInput.guestEmail!),
      };
    }

    try {
      const result = await db.transaction((tx) =>
        persistSubmission(tx, {
          form,
          event,
          questions,
          liveFieldsById,
          identity,
          answers: parsedInput.answers,
          syncFlags: parsedInput.syncToProfile,
          submittedByUserId: ctx.auth.user.id,
          skipRules: true,
        }),
      );
      return { success: true as const, submissionId: result.submissionId };
    } catch (error) {
      rethrowAnswers(submitFormForMemberSchema, error);
    }
  });

export const deleteSubmissionAction = authActionClient
  .metadata({ actionName: "deleteSubmission" })
  .inputSchema(deleteSubmissionSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { form } = await requireFormManagementAccess(ctx.viewer, parsedInput.formId, { write: true });
    await db
      .delete(formSubmissions)
      .where(and(eq(formSubmissions.formId, form.id), eq(formSubmissions.id, parsedInput.submissionId)));
    return { success: true as const };
  });

/**
 * Dry run returns the count for the confirm dialog; the real run sends. Same
 * recipient function both times, so what the manager approved is what goes.
 */
export const sendFormReminderEmailsAction = authActionClient
  .metadata({ actionName: "sendFormReminderEmails" })
  .inputSchema(sendFormReminderEmailsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { context, form } = await requireFormManagementAccess(ctx.viewer, parsedInput.formId, { write: true });
    if (form.isTemplate) throw new FormError("TEMPLATE_READ_ONLY");
    const orgId = context.organization.id;

    const recipients = (await listFormPending(orgId, form.id)).filter((r) => r.email);

    if (parsedInput.dryRun) {
      return { success: true as const, dryRun: true as const, recipientCount: recipients.length };
    }

    const event = await getFormEvent(orgId, form);
    const result = await sendFormReminders({
      organization: context.organization,
      form,
      event,
      recipients,
      actorUserId: ctx.auth.user.id,
    });

    return { success: true as const, dryRun: false as const, recipientCount: result.sent };
  });

// ─── Filling ────────────────────────────────────────────────────────────────

/** Portal: a signed-in member filling for themselves. */
export const submitFormAction = authActionClient
  .metadata({ actionName: "submitForm" })
  .inputSchema(submitFormSchema)
  .action(async ({ parsedInput, ctx }) => {
    const member = await requireCurrentMember(ctx.viewer);
    const orgId = member.orgId;

    const form = await getFormById(orgId, parsedInput.formId);
    if (!form || form.isTemplate) throw new FormError("NOT_FOUND");
    const event = await getFormEvent(orgId, form);
    if (form.eventId && (!event || event.status === "draft")) throw new FormError("NOT_FOUND");

    const questions = await listFormQuestions(orgId, form.id);
    const liveFieldsById = await loadLiveFields(orgId, questions);
    const identity = await buildMemberIdentity(orgId, form, event, member.id);

    try {
      const result = await db.transaction((tx) =>
        persistSubmission(tx, {
          form,
          event,
          questions,
          liveFieldsById,
          identity,
          answers: parsedInput.answers,
          syncFlags: parsedInput.syncToProfile,
          submittedByUserId: null,
        }),
      );
      return { success: true as const, submissionId: result.submissionId };
    } catch (error) {
      rethrowAnswers(submitFormSchema, error);
    }
  });

/** Token link: shadow members, non-activated members, external invitees. */
export const submitFormWithTokenAction = actionClient
  .metadata({ actionName: "submitFormWithToken" })
  .inputSchema(submitFormWithTokenSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();
    // The token opens the form as long as the link is alive; the RSVP
    // deadline is not the form's deadline.
    const resolved = await resolveTokenResponder(organization.id, parsedInput.token, new Date());
    if (!resolved) throw new FormError("TOKEN_INVALID");
    const { event, responder } = resolved;

    const orgId = event.orgId;
    const form = await getFormById(orgId, parsedInput.formId);
    if (!form || form.eventId !== event.id) throw new FormError("NOT_FOUND");

    const questions = await listFormQuestions(orgId, form.id);
    const liveFieldsById = await loadLiveFields(orgId, questions);
    const response = await getResponderResponse(orgId, event.id, responder);

    try {
      const result = await db.transaction(async (tx) => {
        const persisted = await persistSubmission(tx, {
          form,
          event,
          questions,
          liveFieldsById,
          identity: submissionIdentityOf(responder, response?.answer ?? null),
          answers: parsedInput.answers,
          submittedByUserId: null,
        });
        await touchRsvpToken(responder.tokenId, tx);
        return persisted;
      });
      return { success: true as const, submissionId: result.submissionId };
    } catch (error) {
      rethrowAnswers(submitFormWithTokenSchema, error);
    }
  });

const GUEST_FORM_SCOPE = "form_guest_submit";
const GUEST_FORM_WINDOW_MS = 60 * 60 * 1000;
const GUEST_FORM_PER_IP = 10;
const GUEST_FORM_PER_FORM = 200;

/** Public events only. Rate-limited per caller and per form before any write. */
export const submitFormAsGuestAction = actionClient
  .metadata({ actionName: "submitFormAsGuest" })
  .inputSchema(submitFormAsGuestSchema)
  .action(async ({ parsedInput }) => {
    const organization = await requireOrganization();
    const row = await getEventBySlug(organization.id, parsedInput.eventSlug);

    if (!row || row.event.visibility !== "public" || row.event.status === "draft") {
      throw new FormError("NOT_FOUND");
    }

    const form = await getFormById(organization.id, parsedInput.formId);
    if (!form || form.eventId !== row.event.id) throw new FormError("NOT_FOUND");

    const [perIp, perForm] = await Promise.all([
      consumeRateLimit({
        scope: GUEST_FORM_SCOPE,
        identifier: await getRequestIdentifier(),
        limit: GUEST_FORM_PER_IP,
        windowMs: GUEST_FORM_WINDOW_MS,
      }),
      consumeRateLimit({
        scope: GUEST_FORM_SCOPE,
        identifier: `form:${form.id}`,
        limit: GUEST_FORM_PER_FORM,
        windowMs: GUEST_FORM_WINDOW_MS,
      }),
    ]);
    if (!perIp.allowed || !perForm.allowed) throw new FormError("RATE_LIMITED");

    const email = parsedInput.email.trim().toLowerCase();
    const questions = await listFormQuestions(organization.id, form.id);
    const liveFieldsById = await loadLiveFields(organization.id, questions);
    const rsvpAnswer = await getGuestRsvpAnswer(organization.id, row.event.id, email);

    try {
      const result = await db.transaction((tx) =>
        persistSubmission(tx, {
          form,
          event: row.event,
          questions,
          liveFieldsById,
          identity: { kind: "guest", guestEmail: email, guestName: parsedInput.name.trim(), rsvpAnswer },
          answers: parsedInput.answers,
          submittedByUserId: null,
        }),
      );
      return { success: true as const, submissionId: result.submissionId };
    } catch (error) {
      rethrowAnswers(submitFormAsGuestSchema, error);
    }
  });
