import { z } from "zod";

/**
 * Event input shared by the admin form (phase 4) and the actions, so a value
 * the form accepts is one the server accepts.
 */

const slugSchema = z
  .string()
  .trim()
  .min(2, "Slug is required.")
  .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens.");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional()
  .refine((value) => value == null || /^https?:\/\//i.test(value), {
    message: "Link must start with http:// or https://.",
  });

export const eventOwnerTypeSchema = z.enum(["organization", "category", "group"]);
export const eventVisibilitySchema = z.enum(["public", "org", "targeted"]);
export const eventRsvpAnswerSchema = z.enum(["yes", "no", "maybe"]);

export const eventInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(2, "Title is required.").max(200),
    slug: slugSchema,
    descriptionHtml: z.string().max(200_000).nullable().optional(),
    ownerType: eventOwnerTypeSchema,
    ownerCategoryId: z.string().uuid().nullable().optional(),
    ownerGroupId: z.string().uuid().nullable().optional(),
    visibility: eventVisibilitySchema,
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    allDay: z.boolean().default(false),
    rsvpDeadlineAt: z.coerce.date().nullable().optional(),
    capacity: z.number().int().positive().nullable().optional(),
    maxGuestsPerResponse: z.number().int().min(0).max(50).default(0),
    locationName: optionalText(200),
    locationAddress: optionalText(500),
    communicationLink: optionalUrl,
  })
  .superRefine((value, ctx) => {
    if (value.endsAt && !value.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "An end needs a start.",
      });
    }
    if (value.startsAt && value.endsAt && value.endsAt < value.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "End must not be before start.",
      });
    }
    if (value.ownerType === "category" && !value.ownerCategoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerCategoryId"],
        message: "Pick a category.",
      });
    }
    if (value.ownerType === "group" && !value.ownerGroupId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ownerGroupId"],
        message: "Pick a group.",
      });
    }
  });

export type EventInput = z.infer<typeof eventInputSchema>;

export const audienceRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("group"), groupId: z.string().uuid() }),
  z.object({ kind: z.literal("category"), categoryId: z.string().uuid() }),
  z.object({ kind: z.literal("member"), memberId: z.string().uuid() }),
  z.object({
    kind: z.literal("external"),
    externalEmail: z.string().trim().email().max(320),
    externalName: optionalText(200),
  }),
]);

export type AudienceRuleInput = z.infer<typeof audienceRuleSchema>;

export const setEventAudienceSchema = z.object({
  eventId: z.string().uuid(),
  rules: z.array(audienceRuleSchema).max(500),
});

export const addExternalInviteesSchema = z.object({
  eventId: z.string().uuid(),
  /** One address per line, optionally "Name <email>". Parsed server-side. */
  emails: z.string().max(50_000),
});

export const removeExternalInviteeSchema = z.object({
  eventId: z.string().uuid(),
  externalEmail: z.string().trim().email().max(320),
});

export const respondSchema = z.object({
  answer: eventRsvpAnswerSchema,
  guestCount: z.number().int().min(0).max(50).default(0),
});

export const respondToEventSchema = respondSchema.extend({
  eventId: z.string().uuid(),
});

export const respondWithTokenSchema = respondSchema.extend({
  token: z.string().min(16).max(128),
});

export const respondAsGuestSchema = respondSchema.extend({
  eventSlug: slugSchema,
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(320),
});

export const eventRecipientFilterSchema = z.enum([
  "all_eligible",
  "not_responded",
  "not_activated",
  "accepted",
  "reserve",
  "externals",
]);

export type EventRecipientFilter = z.infer<typeof eventRecipientFilterSchema>;

export const sendEventInviteEmailsSchema = z.object({
  eventId: z.string().uuid(),
  filter: eventRecipientFilterSchema,
  dryRun: z.boolean().default(true),
});

export const eventIdSchema = z.object({ eventId: z.string().uuid() });

export const setResponseStandingSchema = z.object({
  eventId: z.string().uuid(),
  responseId: z.string().uuid(),
  standing: z.enum(["confirmed", "reserve"]),
});

export const removeResponseSchema = z.object({
  eventId: z.string().uuid(),
  responseId: z.string().uuid(),
});
