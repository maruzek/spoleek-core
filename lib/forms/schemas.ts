import { z } from "zod";

import { eventOwnerTypeSchema } from "@/lib/events/schemas";
import {
  memberCustomFieldConstraintsSchema,
  pickConstraintsForType,
} from "@/lib/member-custom-field-constraints";

/**
 * Form input shared by the editor and the actions, so a value the editor
 * accepts is one the server accepts. `formQuestionSchema` mirrors the DB
 * CHECKs on `form_questions` so the builder shows a field-level message
 * instead of a constraint violation.
 */

const uuid = z.string().uuid();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

export const formTimingSchema = z.enum([
  "after_rsvp",
  "before_event",
  "during_event",
  "after_event",
  "anytime",
]);
export const formStatusSchema = z.enum(["draft", "open", "closed"]);
export const formVisibilitySchema = z.enum(["org", "targeted"]);
export const formProfileSyncSchema = z.enum(["none", "offer", "offer_checked", "always"]);
export const formAudienceScopeSchema = z.enum(["members", "admins"]);

export const formQuestionTypeSchema = z.enum([
  "text",
  "textarea",
  "boolean",
  "number",
  "email",
  "phone",
  "date",
  "select",
  "multi_select",
]);

// ─── Settings ───────────────────────────────────────────────────────────────

export const formSettingsSchema = z
  .object({
    title: z.string().trim().min(2, "Title is required.").max(200),
    description: optionalText(2000),
    ownerType: eventOwnerTypeSchema,
    ownerCategoryId: uuid.nullable().optional(),
    ownerGroupId: uuid.nullable().optional(),
    timing: formTimingSchema.default("anytime"),
    required: z.boolean().default(false),
    onlyRsvpYes: z.boolean().default(false),
    closesAt: z.coerce.date().nullable().optional(),
    visibility: formVisibilitySchema.default("org"),
  })
  .superRefine((value, ctx) => {
    if (value.ownerType === "category" && !value.ownerCategoryId) {
      ctx.addIssue({ code: "custom", path: ["ownerCategoryId"], message: "Pick a category." });
    }
    if (value.ownerType === "group" && !value.ownerGroupId) {
      ctx.addIssue({ code: "custom", path: ["ownerGroupId"], message: "Pick a group." });
    }
  });

export type FormSettingsInput = z.infer<typeof formSettingsSchema>;

export const createFormSchema = z.object({
  settings: formSettingsSchema,
  fromTemplateId: uuid.optional(),
  eventId: uuid.optional(),
  /** Org admins only; forces organization ownership and no event. */
  asTemplate: z.boolean().default(false),
});

export const updateFormSettingsSchema = z.object({
  formId: uuid,
  settings: formSettingsSchema,
});

export const formIdSchema = z.object({ formId: uuid });

export const setFormStatusSchema = z.object({
  formId: uuid,
  status: formStatusSchema,
});

export const attachFormToEventSchema = z.object({
  formId: uuid,
  eventId: uuid,
});

// ─── Questions ──────────────────────────────────────────────────────────────

const questionBase = z.object({
  /** Absent for a question the builder just added; present to update in place. */
  id: uuid.optional(),
  label: z.string().trim().min(1, "Label is required.").max(300),
  descriptionHtml: z.string().max(50_000).nullable().optional(),
});

const sectionQuestionSchema = questionBase.extend({
  kind: z.literal("section"),
});

const privacyFields = {
  sensitivity: z.enum(["normal", "special_category"]).default("normal"),
  art9Condition: z
    .enum([
      "explicit_consent",
      "vital_interests",
      "not_for_profit_body",
      "legal_claims",
      "health_care",
    ])
    .nullish(),
  processingPurpose: z.string().trim().max(500).nullish(),
  valueVisibility: z.enum(["member_managers", "org_admins"]).default("member_managers"),
  shredAfterEventDays: z.number().int().min(1).max(3650).nullable().default(null),
};

const inputQuestionSchema = questionBase
  .extend({
    kind: z.literal("input"),
    type: formQuestionTypeSchema,
    options: z.array(z.string().trim().min(1)).max(200).default([]),
    constraints: memberCustomFieldConstraintsSchema.default({}),
    required: z.boolean().default(false),
    memberFieldId: uuid.nullable().default(null),
    profileSync: formProfileSyncSchema.default("none"),
    ...privacyFields,
  })
  .superRefine((value, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    // Mirrors `form_questions_profile_sync_check`.
    if (value.profileSync !== "none" && !value.memberFieldId) {
      issue("profileSync", "Link the question to a profile field first.");
    }

    if (value.sensitivity === "special_category") {
      // Mirrors `form_questions_art9_check`.
      if (!value.art9Condition) {
        issue(
          "art9Condition",
          "Choose the Article 9(2) condition that lets the organization hold this.",
        );
      }
      if (!value.processingPurpose || value.processingPurpose.length < 10) {
        issue(
          "processingPurpose",
          "Say what this question is for. It is what the record of processing and any member asking will be answered with.",
        );
      }
      // Mirrors `form_questions_special_category_check`.
      if (value.memberFieldId) {
        issue(
          "memberFieldId",
          "A sensitive question cannot be linked to a profile field: profile values are not encrypted.",
        );
      }
      if (value.shredAfterEventDays === null) {
        issue(
          "shredAfterEventDays",
          "Answers to a sensitive question must be deleted after a set number of days.",
        );
      }
    } else if (value.art9Condition) {
      issue("art9Condition", "Only a special-category question needs an Article 9 condition.");
    }

    const needsOptions = value.type === "select" || value.type === "multi_select";
    if (needsOptions && value.options.length === 0 && !value.memberFieldId) {
      issue("options", "Add at least one option for select questions.");
    }
    if (!needsOptions && value.options.length > 0) {
      issue("options", "Options are only supported for select questions.");
    }

    const c = pickConstraintsForType(value.type, value.constraints);
    const constraintIssue = (message: string) => issue("constraints", message);
    if (c.minAge !== undefined && c.maxAge !== undefined && c.minAge > c.maxAge) {
      constraintIssue("Minimum age cannot be greater than maximum age.");
    }
    if (c.notBefore && c.notAfter && c.notBefore > c.notAfter) {
      constraintIssue("Earliest date cannot be after the latest date.");
    }
    if (c.min !== undefined && c.max !== undefined && c.min > c.max) {
      constraintIssue("Minimum value cannot be greater than maximum value.");
    }
    if (c.minLength !== undefined && c.maxLength !== undefined && c.minLength > c.maxLength) {
      constraintIssue("Minimum length cannot be greater than maximum length.");
    }
    if (
      c.minSelected !== undefined &&
      c.maxSelected !== undefined &&
      c.minSelected > c.maxSelected
    ) {
      constraintIssue("Minimum selected cannot be greater than maximum selected.");
    }
  });

export const formQuestionSchema = z.discriminatedUnion("kind", [
  sectionQuestionSchema,
  inputQuestionSchema,
]);

export type FormQuestionInput = z.infer<typeof formQuestionSchema>;

export const setFormQuestionsSchema = z.object({
  formId: uuid,
  /** The full ordered list; position is the sort order. */
  questions: z.array(formQuestionSchema).max(200),
});

// ─── Audience ───────────────────────────────────────────────────────────────

export const formAudienceRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("group"),
    groupId: uuid,
    scope: formAudienceScopeSchema.default("members"),
  }),
  z.object({
    kind: z.literal("category"),
    categoryId: uuid,
    scope: formAudienceScopeSchema.default("members"),
  }),
  z.object({ kind: z.literal("member"), memberId: uuid }),
]);

export type FormAudienceRuleInput = z.infer<typeof formAudienceRuleSchema>;

export const setFormAudienceSchema = z.object({
  formId: uuid,
  rules: z.array(formAudienceRuleSchema).max(500),
});

// ─── Submitting ─────────────────────────────────────────────────────────────

const answersSchema = z.record(uuid, z.unknown());
const syncFlagsSchema = z.record(uuid, z.boolean()).default({});

export const submitFormSchema = z.object({
  formId: uuid,
  answers: answersSchema,
  syncToProfile: syncFlagsSchema,
});

export const submitFormWithTokenSchema = z.object({
  token: z.string().min(16).max(128),
  formId: uuid,
  answers: answersSchema,
});

export const submitFormAsGuestSchema = z.object({
  eventSlug: z.string().trim().min(2).max(200),
  formId: uuid,
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320),
  answers: answersSchema,
});

/** A manager submitting or editing on someone's behalf. */
export const submitFormForMemberSchema = z
  .object({
    formId: uuid,
    memberId: uuid.optional(),
    guestEmail: z.string().trim().email().max(320).optional(),
    guestName: z.string().trim().min(2).max(200).optional(),
    answers: answersSchema,
    syncToProfile: syncFlagsSchema,
  })
  .superRefine((value, ctx) => {
    if (!value.memberId && !value.guestEmail) {
      ctx.addIssue({ code: "custom", path: ["memberId"], message: "Pick a member or enter an email." });
    }
    if (value.memberId && value.guestEmail) {
      ctx.addIssue({ code: "custom", path: ["guestEmail"], message: "Either a member or a guest, not both." });
    }
  });

export const deleteSubmissionSchema = z.object({
  formId: uuid,
  submissionId: uuid,
});

// ─── Reminders ──────────────────────────────────────────────────────────────

export const sendFormReminderEmailsSchema = z.object({
  formId: uuid,
  dryRun: z.boolean().default(true),
});
