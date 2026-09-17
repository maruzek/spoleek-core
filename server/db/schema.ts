import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Type-only: erased at compile time, so this does not create an import cycle.
import type { MemberCustomFieldConstraints } from "@/lib/member-custom-field-constraints";

export const systemRoleEnum = pgEnum("system_role", [
  "member",
  "system_admin",
]);

export const tenantRoleEnum = pgEnum("tenant_role", [
  "member",
  "leader",
  "org_admin",
]);

export const membershipStatusEnum = pgEnum("membership_status", [
  "invited",
  "pending",
  "active",
  "suspended",
  "archived",
  "deleted",
]);

export const memberInviteStatusEnum = pgEnum("member_invite_status", [
  "pending",
  "sent",
  "completed",
  "expired",
  "failed",
]);

export const memberInviteDeliveryStatusEnum = pgEnum("member_invite_delivery_status", [
  "pending",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "suppressed",
  "failed",
]);

export const memberAuthEventTypeEnum = pgEnum("member_auth_event_type", [
  "member_approved",
  "member_rejected",
  "invite_send_requested",
  "invite_sent",
  "invite_send_skipped",
  "invite_delivery_updated",
  "invite_completed",
  "activation_attempt_blocked",
  "password_reset_sent",
  "workspace_provisioned",
  "workspace_provision_failed",
  "workspace_user_linked",
  // A copy of everything held about this member was produced, under Art. 15
  // or Art. 20. Recorded because an export is a read of the entire record,
  // and because "did we answer that request?" needs an answer.
  "data_exported",
]);

export const emailDirectionEnum = pgEnum("email_direction", [
  "outbound",
  "inbound",
]);

export const emailKindEnum = pgEnum("email_kind", [
  "member_activation_invite",
  "workspace_welcome",
  "registration_submitted",
  "registration_acknowledgement",
  "registration_duplicate_notice",
  "registration_rejected",
  // Sent when a membership is deleted. Carries the date the record is erased
  // and, for a member with a Workspace account, the deadline for exporting
  // their own data — the one piece of information they cannot get anywhere
  // else once they are signed out.
  "membership_deleted",
  // Reminders for the yearly member report. Routed through
  // `sendNotificationEmails` so a deadline the board enforces is provably
  // delivered rather than merely sent.
  "report_reminder",
  "report_digest",
  // A new version of a legal document, sent only when an admin explicitly asks
  // for it on the publish dialog. Never automatic: an accidental blast to the
  // whole membership of a political party is not recoverable socially.
  "policy_version_published",
  // An event invitation, sent only when a manager explicitly asks for it on
  // the send dialog after seeing the recipient count. Never automatic:
  // publishing, editing or targeting an event sends nothing.
  "event_invite",
  // A reminder to fill a form, sent only when a manager explicitly asks for
  // it after seeing the pending count. Never automatic, for the same reason
  // as `event_invite`.
  "form_reminder",
]);

export const emailActivityStatusEnum = pgEnum("email_activity_status", [
  "sent",
  "delivered",
  "bounced",
  "complained",
  "suppressed",
  "failed",
]);

export const emailActivityEventTypeEnum = pgEnum("email_activity_event_type", [
  "api_accepted",
  "resend_requested",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "suppressed",
  "failed",
]);

export const memberCustomFieldTypeEnum = pgEnum("member_custom_field_type", [
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

export const memberCustomFieldStageEnum = pgEnum("member_custom_field_stage", [
  "registration",
  "post_approval",
  "optional",
  "admin_only",
]);

/**
 * Who may read a field's stored values.
 *
 * Ordered from most open to least. Deliberately about the *value*, not the
 * field: a leader who cannot read an answer is still told the field exists and
 * whether it was answered, because an empty field and a withheld one must never
 * look the same — that is how somebody concludes no allergy was declared.
 *
 * The member is not on this ladder. They always reach their own answers through
 * the portal (subject to `stage`) and always through their Art. 15 export, and
 * there is no lawful setting that changes either. `stage: admin_only` governs
 * whether they are *asked* for a value, not whether they may see it.
 *
 * Future rungs — visible to every member (a directory), or public — belong
 * above `member_managers` and are deliberately absent: both are disclosure
 * beyond the staff who administer the register, and they are blocked on the
 * separate opt-in consent model (MAR-151, MAR-35).
 */
/**
 * Whether a field holds Art. 9 special-category data.
 *
 * Orthogonal to `valueVisibility`, and the distinction is the whole point:
 * visibility is an access control answering *who inside the organization may
 * read this*, while sensitivity is an accountability record answering *whether
 * the organization may hold it at all*. Locking a field to org admins does not
 * make holding it lawful. Art. 9(1) is a prohibition; only a condition in
 * Art. 9(2) lifts it.
 */
export const memberCustomFieldSensitivityEnum = pgEnum(
  "member_custom_field_sensitivity",
  ["normal", "special_category"],
);

/**
 * The Art. 9(2) condition an organization relies on to hold a special-category
 * field. Not the full list — these are the ones a membership organization
 * plausibly uses. Anything else is a conversation with a practitioner, not a
 * dropdown.
 */
export const memberCustomFieldArt9ConditionEnum = pgEnum(
  "member_custom_field_art9_condition",
  [
    /** 9(2)(a) — explicit consent for a specified purpose. */
    "explicit_consent",
    /** 9(2)(c) — vital interests, where the member cannot give consent. */
    "vital_interests",
    /** 9(2)(d) — the not-for-profit body exemption the register itself uses. */
    "not_for_profit_body",
    /** 9(2)(f) — establishment, exercise or defence of legal claims. */
    "legal_claims",
    /** 9(2)(h) — preventive medicine, medical diagnosis, health care. */
    "health_care",
  ],
);

export const memberCustomFieldVisibilityEnum = pgEnum(
  "member_custom_field_visibility",
  [
    // Org admins, plus any leader whose delegated scope covers the member.
    "member_managers",
    // Org admins only. For data a leader has no purpose to read.
    "org_admins",
  ],
);

export const memberCustomFieldDiscoveryModeEnum = pgEnum(
  "member_custom_field_discovery_mode",
  ["visible", "available", "hidden"]
);

export const groupCategorySelectionModeEnum = pgEnum(
  "group_category_selection_mode",
  ["single", "multiple"],
);

export const groupJoinPolicyEnum = pgEnum("group_join_policy", [
  "admin_only",
  "free_join_leave",
  "request_to_join",
]);

export const groupMembershipRoleEnum = pgEnum("group_membership_role", [
  "member",
  "group_admin",
]);

/**
 * When a maximum age takes effect.
 *
 * Stanovy almost never say "membership ends on your 26th birthday" — they say
 * something closer to "at the end of the year in which the member turns 26",
 * because expiring somebody mid-camp is unworkable. `period_end` is therefore
 * the default, and it reuses the organization's own membership period so it
 * stays correct if that ever stops being the calendar year.
 */
export const maximumAgeEffectEnum = pgEnum("maximum_age_effect", [
  "period_end",
  "birthday",
]);

export const membershipManagementModeEnum = pgEnum("membership_management_mode", [
  "none",
  "periodic_renewal",
]);

export const memberPreferredEmailEnum = pgEnum("member_preferred_email", [
  "personal",
  "workspace",
]);

/**
 * Why a membership was deleted.
 *
 * Not decoration: an Art. 17 erasure request and an admin tidying the roster
 * are different events. The first is a data subject exercising a right, which
 * the organization may have to evidence and which arguably deserves a shorter
 * grace period than a deletion the member never asked for. The second is an
 * administrative act that most wants to be undoable.
 *
 * `system` covers deletions no human initiated, so a future automated rule
 * cannot be mistaken for an admin's decision after the fact.
 */
export const memberDeletionReasonEnum = pgEnum("member_deletion_reason", [
  "admin_request",
  "member_request",
  "aged_out",
  "system",
]);

export const memberPaymentTypeEnum = pgEnum("member_payment_type", [
  "membership_fee",
  "event",
]);

export const memberPaymentStatusEnum = pgEnum("member_payment_status", [
  "pending",
  "paid",
  "overdue",
  "cancelled",
  // Set when a paid event payment loses its confirmed-yes response (answer
  // changed, demoted to the reserve list, response deleted). Nothing moves it
  // on automatically; a manager settles it by hand (`cancelled` with reason
  // `refunded`).
  "refund_due",
]);

/** `member_payments.period_key` for event rows is this prefix + the event id. */
export const EVENT_PAYMENT_PERIOD_KEY_PREFIX = "event:";

// ─── Events ─────────────────────────────────────────────────────────────────

/**
 * Who owns an event: the organization, one category, or one group. Ownership
 * decides who may manage it and where it is listed — it is deliberately not
 * the audience, which is a separate rule list (`event_audience`).
 */
export const eventOwnerTypeEnum = pgEnum("event_owner_type", [
  "organization",
  "category",
  "group",
]);

export const eventVisibilityEnum = pgEnum("event_visibility", [
  "public",
  "org",
  "targeted",
]);

export const eventStatusEnum = pgEnum("event_status", [
  "draft",
  "published",
  "cancelled",
]);

export const eventAudienceKindEnum = pgEnum("event_audience_kind", [
  "group",
  "category",
  "member",
  "external",
]);

export const eventRsvpAnswerEnum = pgEnum("event_rsvp_answer", [
  "yes",
  "no",
  "maybe",
]);

export const eventRsvpStandingEnum = pgEnum("event_rsvp_standing", [
  "confirmed",
  "reserve",
]);

// ─── Forms ──────────────────────────────────────────────────────────────────

/**
 * When a form should be filled. A placement, not a gate: it decides where the
 * form is surfaced and nagged for, never whether an open form accepts a
 * submission.
 */
export const formTimingEnum = pgEnum("form_timing", [
  "after_rsvp",
  "before_event",
  "during_event",
  "after_event",
  "anytime",
]);

export const formStatusEnum = pgEnum("form_status", [
  "draft",
  "open",
  "closed",
]);

/** Only read for forms without an event; a linked form inherits the event's reach. */
export const formVisibilityEnum = pgEnum("form_visibility", [
  "org",
  "targeted",
]);

export const formQuestionKindEnum = pgEnum("form_question_kind", [
  "input",
  "section",
]);

/**
 * Whether an answer to a profile-linked question is written back to the
 * member's custom field: never, offered as an unticked / ticked checkbox, or
 * always.
 */
export const formProfileSyncEnum = pgEnum("form_profile_sync", [
  "none",
  "offer",
  "offer_checked",
  "always",
]);

export const formAudienceKindEnum = pgEnum("form_audience_kind", [
  "group",
  "category",
  "member",
]);

/** `admins` narrows a group / category rule to its admins ("leaders only"). */
export const formAudienceScopeEnum = pgEnum("form_audience_scope", [
  "members",
  "admins",
]);

/** Who may create organization-wide events (owner type `organization`). */
export const orgEventCreatorsEnum = pgEnum("org_event_creators", [
  "org_admins",
  "category_admins",
  "any_admin",
]);

// ─── Yearly membership report ───────────────────────────────────────────────

/**
 * How a membership period is named and bounded.
 *
 * `calendar_year` is the only mode built so far: the period is 1 January to 31
 * December and is labelled with the single year ("2026"). `renewal_span` exists
 * in the enum so the org that renews mid-year can be supported without a second
 * migration, but nothing reads it yet.
 *
 * TODO(spanning-periods): implement `renewal_span` — the label becomes
 * "2026/2027" and the bounds run from the renewal day to the day before it.
 * `getPeriodLabel()` in server/lib/payment-lifecycle.ts already emits the
 * spanning label unconditionally and must switch on this column instead.
 */
export const membershipPeriodModeEnum = pgEnum("membership_period_mode", [
  "calendar_year",
  "renewal_span",
]);

export const membershipReportStatusEnum = pgEnum("membership_report_status", [
  "draft",
  "open",
  "closed",
]);

/**
 * Where one group stands in the confirmation workflow.
 *
 * `returned` is distinct from `not_started` on purpose: both need the group's
 * attention, but only one of them means the board rejected something, and the
 * dashboard has to be able to say which.
 */
export const membershipReportGroupStatusEnum = pgEnum(
  "membership_report_group_status",
  ["not_started", "in_progress", "submitted", "approved", "returned"],
);

/**
 * Why a member counts towards the report.
 *
 * Kept alongside the frozen roster so the board reads "34 paid, 2 waived"
 * rather than a flat 36 — a waived member is a decision someone made, and
 * collapsing it into the paid count hides that decision.
 */
/**
 * Rungs of the confirmation reminder ladder, in ascending urgency.
 *
 * Fixed rather than configurable: three descending numbers plus a validation
 * rule that they stay ordered is a lot of setting for something nobody tunes.
 */
export const membershipReportReminderStageEnum = pgEnum(
  "membership_report_reminder_stage",
  ["t_minus_14", "t_minus_7", "t_minus_1", "overdue"],
);

export const membershipReportConfirmationBasisEnum = pgEnum(
  "membership_report_confirmation_basis",
  ["paid", "waived", "manual"],
);

// ─── Workspace group link ───────────────────────────────────────────────────

/**
 * Which system decides membership for a linked Google group. There is
 * deliberately no two-way mode: without a shared clock "both ways" degrades to
 * "last writer silently wins", and a member quietly reappearing after being
 * removed is a worse failure than making the admin pick a master.
 */
export const workspaceLinkDirectionEnum = pgEnum("workspace_link_direction", [
  "push",
  "observe",
]);

export const workspaceGroupRoleEnum = pgEnum("workspace_group_role", [
  "member",
  "manager",
  "owner",
]);

/**
 * `remove_owned` only removes addresses this ledger says Spoleek added, so an
 * address a Workspace admin added by hand (or an external subscriber) is
 * reported as drift instead of being deleted.
 */
export const workspaceLinkRemovalPolicyEnum = pgEnum(
  "workspace_link_removal_policy",
  ["remove_owned", "remove_all", "keep"],
);

export const workspaceLinkSyncStatusEnum = pgEnum("workspace_link_sync_status", [
  "never",
  "ok",
  "error",
]);

/**
 * A drift row is one address that is in the Google group but not in the Spoleek
 * roster. `ignored` is how an admin says "this one is meant to be here" without
 * Spoleek ever adopting or deleting it. There is no `resolved` state: adopting
 * or removing deletes the row outright, so if the address is still in Google at
 * the next reconcile it truthfully comes back as `open`.
 */
export const workspaceDriftStatusEnum = pgEnum("workspace_drift_status", [
  "open",
  "ignored",
]);

export const workspaceSyncOperationKindEnum = pgEnum(
  "workspace_sync_operation_kind",
  ["add_member", "remove_member", "update_role"],
);

export const workspaceSyncOperationStatusEnum = pgEnum(
  "workspace_sync_operation_status",
  ["pending", "succeeded", "failed"],
);

export const policyDocumentKindEnum = pgEnum("policy_document_kind", [
  "terms",
  "privacy",
  "other",
]);

export const policyVersionStatusEnum = pgEnum("policy_version_status", [
  "draft",
  "published",
  "archived",
]);

export const policyAcknowledgementMethodEnum = pgEnum(
  "policy_acknowledgement_method",
  [
    "registration",
    "portal_prompt",
    "admin_recorded",
    "import_notice",
  ],
);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ─── Better Auth-managed tables (text IDs, do not change to uuid) ────────────

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    systemRole: systemRoleEnum("system_role").notNull().default("member"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sessions_token_idx").on(table.token),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("accounts_provider_account_idx").on(
      table.providerId,
      table.accountId,
    ),
    index("accounts_user_idx").on(table.userId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("verifications_identifier_idx").on(table.identifier),
  ],
);

// ─── Application-owned tables (uuid IDs) ─────────────────────────────────────

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    primaryEmail: text("primary_email"),
    website: text("website"),
    joinPageHeadline: text("join_page_headline").notNull().default("Join our organization"),
    joinPageBody: text("join_page_body").notNull().default(
      "Tell us a little about yourself and submit your application. We will review it and get back to you soon.",
    ),
    countryCode: text("country_code").notNull().default("CZ"),
    locale: text("locale").notNull().default("en"),
    membersSortLocale: text("members_sort_locale").notNull().default("und"),
    timezone: text("timezone").notNull().default("Europe/Prague"),
    setupDeploymentTrack: text("setup_deployment_track"),
    setupAuthStrategy: text("setup_auth_strategy"),
    workspaceDomain: text("workspace_domain"),
    workspaceSyncEnabled: boolean("workspace_sync_enabled").notNull().default(false),
    workspaceModuleEnabled: boolean("workspace_module_enabled").notNull().default(false),
    workspaceEmailTemplate: text("workspace_email_template")
      .notNull()
      .default("{first}.{last}"),
    workspaceConnectedAt: timestamp("workspace_connected_at", {
      withTimezone: true,
    }),
    workspaceAdminEmail: text("workspace_admin_email"),
    workspaceProvisionFields: jsonb("workspace_provision_fields")
      .$type<{ fieldKey: string; enabled: boolean; required: boolean }[]>()
      .notNull()
      .default([]),
    defaultEmailPreference: memberPreferredEmailEnum("default_email_preference")
      .notNull()
      .default("personal"),
    membershipManagementMode: membershipManagementModeEnum("membership_management_mode")
      .notNull()
      .default("none"),
    membershipRenewalMonth: integer("membership_renewal_month"),
    membershipRenewalDay: integer("membership_renewal_day"),
    membershipFeeEnabled: boolean("membership_fee_enabled").notNull().default(false),
    membershipFeeAmount: integer("membership_fee_amount"),
    membershipFeeCurrency: text("membership_fee_currency").notNull().default("CZK"),
    membershipFeeBankAccount: text("membership_fee_bank_account"),
    membershipFeePaymentWindowDays: integer("membership_fee_payment_window_days")
      .notNull()
      .default(30),
    /**
     * How the membership period is named and bounded. See
     * `membershipPeriodModeEnum` — only `calendar_year` is implemented.
     */
    membershipPeriodMode: membershipPeriodModeEnum("membership_period_mode")
      .notNull()
      .default("calendar_year"),
    /** Master switch for the yearly member report module and its navigation. */
    membershipReportEnabled: boolean("membership_report_enabled")
      .notNull()
      .default(false),
    /**
     * Whether an org admin may approve a group report they submitted themselves.
     *
     * Off by default, because a two-stage workflow where both stages are the
     * same person is a one-stage workflow with extra clicks. Small organizations
     * where the region admin genuinely is the whole board can turn it on; the
     * approval is then still recorded and flagged in the UI as self-approved.
     */
    membershipReportAllowSelfApproval: boolean("membership_report_allow_self_approval")
      .notNull()
      .default(false),
    /**
     * Month and day by which every group must confirm its report.
     *
     * Deliberately its own setting rather than an offset from the fee payment
     * window: collecting the money and reporting the roster to the board are
     * different deadlines set by different people, and tying them together
     * would move one whenever someone adjusted the other. Null means no
     * deadline. Recurs yearly — the report anchors it to its own period's year.
     */
    membershipReportConfirmMonth: integer("membership_report_confirm_month"),
    membershipReportConfirmDay: integer("membership_report_confirm_day"),
    /**
     * Reminder emails to group admins who have not submitted, and the digest to
     * the board. Only ever sent when a confirmation deadline is configured —
     * without one there is nothing to count down to.
     */
    emailNotifyReportReminder: boolean("email_notify_report_reminder")
      .notNull()
      .default(true),
    emailNotifyRenewalHeadsup: boolean("email_notify_renewal_headsup").notNull().default(true),
    emailNotifyRenewalHeadsupDaysBefore: integer("email_notify_renewal_headsup_days_before")
      .notNull()
      .default(7),
    emailNotifyOverdue: boolean("email_notify_overdue").notNull().default(true),
    emailNotifyPaymentConfirmed: boolean("email_notify_payment_confirmed").notNull().default(true),
    /**
     * Master switch for the "someone applied to join" alert. Off means nobody is
     * mailed, whatever the category and group settings say.
     */
    emailNotifyRegistration: boolean("email_notify_registration").notNull().default(true),
    /**
     * Whether every org admin is on that list. Kept separate from the master
     * switch so a large organization can route applications to the group admins
     * who actually handle them without mailing the whole board.
     */
    emailNotifyRegistrationOrgAdmins: boolean("email_notify_registration_org_admins")
      .notNull()
      .default(true),
    registrationNotificationEmail: text("registration_notification_email"),
    /**
     * Age below which an application is flagged for manual handling.
     *
     * Deliberately not a validation rule. A date field's `minAge` constraint
     * rejects the submission outright, which is the wrong instrument here: a
     * youth organization wants the young applicant to reach a human with a
     * guardian countersignature, not to be told no by a form. Null means the
     * organization has not set one and nothing is flagged.
     */
    registrationMinimumAge: integer("registration_minimum_age"),
    /**
     * The age at which membership ends — not the last age at which somebody
     * may be a member.
     *
     * Named for the ending, because "maximum age" is ambiguous the moment the
     * two effects below are involved: statutes say either "ends on the 36th
     * birthday" or "ends at the end of the year in which the member turns 36",
     * and both are the same number under this name. Read as a maximum it would
     * be 35 in the first case and unclear in the second.
     *
     * Unlike the minimum, this is not a flag for review — past it somebody is
     * no longer a member, and the membership contract that is the lawful basis
     * for processing them as one has ended. Null means no age limit.
     */
    // TODO(column-rename): the column is still `registration_maximum_age`
    // from migration 0056. The property name is the one that matters for
    // reading the code; renaming the column needs an interactive
    // drizzle-kit generate and is pure tidy-up, so it is deliberately not
    // bundled with the semantics fix.
    membershipEndsAtAge: integer("registration_maximum_age"),
    maximumAgeEffect: maximumAgeEffectEnum("maximum_age_effect")
      .notNull()
      .default("period_end"),
    orgEventCreators: orgEventCreatorsEnum("org_event_creators")
      .notNull()
      .default("org_admins"),
    /**
     * Days after an event ends before its guest data (external invitees,
     * RSVP tokens, guest names and emails) is shredded by the retention cron.
     * Headcounts survive; identities do not.
     */
    eventGuestRetentionDays: integer("event_guest_retention_days")
      .notNull()
      .default(30),
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("organizations_slug_idx").on(table.slug),
    check(
      "organizations_event_guest_retention_check",
      sql`${table.eventGuestRetentionDays} > 0`,
    ),
    check(
      "organizations_renewal_month_check",
      sql`${table.membershipRenewalMonth} IS NULL OR (${table.membershipRenewalMonth} >= 1 AND ${table.membershipRenewalMonth} <= 12)`,
    ),
    check(
      "organizations_renewal_day_check",
      sql`${table.membershipRenewalDay} IS NULL OR (${table.membershipRenewalDay} >= 1 AND ${table.membershipRenewalDay} <= 31)`,
    ),
    check(
      "organizations_fee_amount_check",
      sql`${table.membershipFeeAmount} IS NULL OR ${table.membershipFeeAmount} > 0`,
    ),
    check(
      "organizations_payment_window_check",
      sql`${table.membershipFeePaymentWindowDays} >= 1`,
    ),
    check(
      "organizations_report_confirm_month_check",
      sql`${table.membershipReportConfirmMonth} IS NULL OR (${table.membershipReportConfirmMonth} >= 1 AND ${table.membershipReportConfirmMonth} <= 12)`,
    ),
    check(
      "organizations_maximum_age_check",
      sql`${table.membershipEndsAtAge} IS NULL OR (${table.membershipEndsAtAge} >= 0 AND ${table.membershipEndsAtAge} <= 150)`,
    ),
    // A window that excludes everybody is a configuration mistake, not a rule.
    check(
      "organizations_age_window_check",
      sql`${table.registrationMinimumAge} IS NULL OR ${table.membershipEndsAtAge} IS NULL OR ${table.registrationMinimumAge} < ${table.membershipEndsAtAge}`,
    ),
    check(
      "organizations_minimum_age_check",
      sql`${table.registrationMinimumAge} IS NULL OR (${table.registrationMinimumAge} >= 0 AND ${table.registrationMinimumAge} <= 150)`,
    ),
    check(
      "organizations_report_confirm_day_check",
      sql`${table.membershipReportConfirmDay} IS NULL OR (${table.membershipReportConfirmDay} >= 1 AND ${table.membershipReportConfirmDay} <= 31)`,
    ),
  ],
);

export const organizationPolicies = pgTable(
  "organization_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // The legal documents moved to policy_documents / policy_versions, where a
    // published version is immutable. What is left here is the invite email
    // copy, which is not a legal document and is edited freely.
    memberInviteEmailSubject: text("member_invite_email_subject")
      .notNull()
      .default("Your membership has been approved"),
    memberInviteEmailBody: text("member_invite_email_body")
      .notNull()
      .default(
        "Your membership request has been approved. Use the button below to create your password and complete the remaining profile fields before signing in to the app.",
      ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("organization_policies_org_idx").on(table.orgId),
  ],
);

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email"),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    role: tenantRoleEnum("role").notNull().default("member"),
    status: membershipStatusEnum("status").notNull().default("pending"),
    // Consent lives in member_policy_acknowledgements, one row per document
    // version, so the record says which text was agreed to and how. The three
    // columns that used to sit here could not.
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    workspaceUserEmail: text("workspace_user_email"),
    workspaceUserId: text("workspace_user_id"),
    workspaceProvisionedAt: timestamp("workspace_provisioned_at", {
      withTimezone: true,
    }),
    preferredEmail: memberPreferredEmailEnum("preferred_email"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: text("deleted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * The status this member held before deletion, so restoring puts them back
     * where they were.
     *
     * Without it, restore has to guess, and the only defensible guess is
     * `active` — which silently un-suspends a member somebody suspended on
     * purpose. Null on every row that was never deleted.
     */
    previousStatus: membershipStatusEnum("previous_status"),
    /**
     * When the record becomes eligible for permanent erasure.
     *
     * The retention anchor as stored data rather than `deletedAt` plus a
     * constant recomputed at every read. Two reasons it has to be a column: a
     * single member can be held longer (a dispute, an audit) without changing a
     * global setting, and shortening `MEMBER_SOFT_DELETE_RETENTION_DAYS` must
     * not retroactively purge people whose grace period was promised in an
     * email that already went out.
     */
    purgeAfter: timestamp("purge_after", { withTimezone: true }),
    deletionReason: memberDeletionReasonEnum("deletion_reason"),
    /**
     * Failed attempts to delete this member's Google Workspace account during
     * the purge.
     *
     * The purge deletes the Workspace account before the member row, because
     * the row is the only record that an account still needs deleting — see
     * `purgeDeletedMembers`. A failure therefore has to leave the row in place
     * and be visible, rather than retry forever in silence.
     */
    workspacePurgeAttempts: integer("workspace_purge_attempts").notNull().default(0),
    workspacePurgeLastError: text("workspace_purge_last_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tenant_members_org_user_idx").on(table.orgId, table.userId),
    index("tenant_members_org_email_idx").on(table.orgId, table.email),
    index("tenant_members_org_status_idx").on(table.orgId, table.status),
    index("tenant_members_user_idx").on(table.userId),
    index("tenant_members_active_idx")
      .on(table.orgId, table.status)
      .where(sql`status != 'deleted'`),
    // The purge job's only query: deleted members whose grace period is up.
    index("tenant_members_purge_idx")
      .on(table.purgeAfter)
      .where(sql`status = 'deleted'`),
  ],
);

// ─── Versioned legal policies ────────────────────────────────────────────────
//
// A published version is IMMUTABLE. Editing one produces a new draft; the old
// row keeps the exact text somebody accepted. That is the entire point of the
// three tables below — `organization_policies` holds a single mutable row, so
// every edit there silently destroys the evidence behind an acknowledgement.
//
// See docs/legal-policies.md §3.

export const policyDocuments = pgTable(
  "policy_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: policyDocumentKindEnum("kind").notNull(),
    /** Public URL segment: /legal/<slug>. */
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    /**
     * True for an agreement the member accepts (terms, membership rules).
     * False for a disclosure the member confirms having read (privacy notice) —
     * nobody can "agree to" a statement of fact, and the prompt wording follows
     * this flag. Both still gate the portal; see docs/legal-policies.md §2.2.
     */
    requiresAcceptance: boolean("requires_acceptance").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("policy_documents_org_slug_idx").on(table.orgId, table.slug),
    index("policy_documents_org_active_idx")
      .on(table.orgId)
      .where(sql`is_active`),
  ],
);

export const policyVersions = pgTable(
  "policy_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => policyDocuments.id, { onDelete: "cascade" }),
    /**
     * Admin-facing label, e.g. "2.0" or "2026-09". Unique per document.
     *
     * Null while the version is a draft: the label is chosen at publish time,
     * and inventing a placeholder would put a fake version into the public
     * archived URL space. Postgres allows many NULLs under a unique index, and
     * only one draft per document exists anyway.
     */
    version: text("version"),
    /**
     * Sanitized at publish time and stored as-is. Archived versions render
     * straight from this string and are never passed back through a
     * current-day pipeline, or "immutable" would quietly change whenever the
     * sanitizer or the editor is upgraded.
     */
    bodyHtml: text("body_html").notNull().default(""),
    summaryOfChanges: text("summary_of_changes").notNull().default(""),
    status: policyVersionStatusEnum("status").notNull().default("draft"),
    /**
     * Whether members must act on this version. A typo fix should not re-prompt
     * the whole roster, and keeping it per-version means the reason a given
     * cohort was re-prompted stays auditable.
     */
    isMaterialChange: boolean("is_material_change").notNull().default(true),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedByUserId: text("published_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("policy_versions_document_version_idx").on(
      table.documentId,
      table.version,
    ),
    // At most one draft per document: the editor edits "the" draft, and two of
    // them would make "publish" ambiguous.
    uniqueIndex("policy_versions_document_draft_idx")
      .on(table.documentId)
      .where(sql`status = 'draft'`),
    index("policy_versions_document_status_idx").on(table.documentId, table.status),
  ],
);

export const memberPolicyAcknowledgements = pgTable(
  "member_policy_acknowledgements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    // Deliberately `restrict`: deleting a version somebody accepted must be
    // impossible, otherwise the record proves nothing.
    policyVersionId: uuid("policy_version_id")
      .notNull()
      .references(() => policyVersions.id, { onDelete: "restrict" }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * How the acknowledgement was obtained. Without this a paper form signed at
     * a regional meeting and a click in the app are indistinguishable, which
     * turns a true statement into an unverifiable one.
     */
    method: policyAcknowledgementMethodEnum("method").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("member_policy_ack_member_version_idx").on(
      table.memberId,
      table.policyVersionId,
    ),
    index("member_policy_ack_org_member_idx").on(table.orgId, table.memberId),
    index("member_policy_ack_version_idx").on(table.policyVersionId),
  ],
);

export const groupCategories = pgTable(
  "group_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    registrationFieldLabel: text("registration_field_label"),
    isActive: boolean("is_active").notNull().default(true),
    isPinnedToNavigation: boolean("is_pinned_to_navigation").notNull().default(false),
    showInRegistration: boolean("show_in_registration").notNull().default(false),
    showInMembersTable: boolean("show_in_members_table").notNull().default(false),
    groupAdminsManageMembers: boolean("group_admins_manage_members")
      .notNull()
      .default(false),
    /**
     * Only meaningful together with `showInRegistration`: when an applicant
     * picks a group from this category on the join form, the admins responsible
     * for that group are told. Kept as a dormant flag when the category leaves
     * the join form so turning it back on restores the previous choice.
     */
    notifyOnRegistration: boolean("notify_on_registration").notNull().default(false),
    notificationEmail: text("notification_email"),
    managesMembershipFees: boolean("manages_membership_fees")
      .notNull()
      .default(false),
    selectionMode: groupCategorySelectionModeEnum("selection_mode")
      .notNull()
      .default("multiple"),
    selectionRequired: boolean("selection_required").notNull().default(false),
    maxSelections: integer("max_selections"),
    defaultJoinPolicy: groupJoinPolicyEnum("default_join_policy")
      .notNull()
      .default("admin_only"),
    sortOrder: integer("sort_order").notNull().default(0),
    specialCapability: text("special_capability"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("group_categories_org_slug_idx").on(table.orgId, table.slug),
    index("group_categories_org_sort_idx").on(table.orgId, table.sortOrder),
    index("group_categories_org_active_idx").on(table.orgId, table.isActive),
    check(
      "group_categories_max_selections_check",
      sql`${table.maxSelections} IS NULL OR ${table.maxSelections} >= 1`,
    ),
    check(
      "group_categories_sort_order_check",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => groupCategories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    joinPolicy: groupJoinPolicyEnum("join_policy").notNull().default("admin_only"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    feeRenewalMonth: integer("fee_renewal_month"),
    feeRenewalDay: integer("fee_renewal_day"),
    feeAmount: integer("fee_amount"),
    feeBankAccount: text("fee_bank_account"),
    feePaymentWindowDays: integer("fee_payment_window_days"),
    workspaceOrgUnitPath: text("workspace_org_unit_path"),
    /**
     * Send to the linked Google group instead of to each group admin. The sync
     * already pushes group admins into that Google group, so this is one Resend
     * send instead of N with the same reach — not a narrower audience.
     */
    notifyViaWorkspaceGroup: boolean("notify_via_workspace_group").notNull().default(false),
    notificationEmail: text("notification_email"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("groups_org_slug_idx").on(table.orgId, table.slug),
    index("groups_category_sort_idx").on(table.categoryId, table.sortOrder),
    index("groups_org_category_idx").on(table.orgId, table.categoryId),
    index("groups_org_active_idx").on(table.orgId, table.isActive),
    check(
      "groups_fee_renewal_month_check",
      sql`${table.feeRenewalMonth} IS NULL OR (${table.feeRenewalMonth} >= 1 AND ${table.feeRenewalMonth} <= 12)`,
    ),
    check(
      "groups_fee_renewal_day_check",
      sql`${table.feeRenewalDay} IS NULL OR (${table.feeRenewalDay} >= 1 AND ${table.feeRenewalDay} <= 31)`,
    ),
    check(
      "groups_fee_amount_check",
      sql`${table.feeAmount} IS NULL OR ${table.feeAmount} > 0`,
    ),
    check(
      "groups_sort_order_check",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const groupMemberships = pgTable(
  "group_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    role: groupMembershipRoleEnum("role").notNull().default("member"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("group_memberships_group_member_idx").on(
      table.groupId,
      table.memberId,
    ),
    index("group_memberships_org_member_idx").on(table.orgId, table.memberId),
    index("group_memberships_org_group_role_idx").on(
      table.orgId,
      table.groupId,
      table.role,
    ),
  ],
);

export const categoryAdminAssignments = pgTable(
  "category_admin_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => groupCategories.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("category_admin_assignments_category_member_idx").on(
      table.categoryId,
      table.memberId,
    ),
    index("category_admin_assignments_org_category_idx").on(
      table.orgId,
      table.categoryId,
    ),
    index("category_admin_assignments_org_member_idx").on(
      table.orgId,
      table.memberId,
    ),
  ],
);

export const memberCustomFields = pgTable(
  "member_custom_fields",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    type: memberCustomFieldTypeEnum("type").notNull(),
    stage: memberCustomFieldStageEnum("stage").notNull().default("optional"),
    discoveryMode: memberCustomFieldDiscoveryModeEnum("discovery_mode").notNull().default("available"),
    required: boolean("required").notNull().default(false),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    constraints: jsonb("constraints")
      .$type<MemberCustomFieldConstraints>()
      .notNull()
      .default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    /**
     * Marks the one `date` field that holds the member's date of birth.
     *
     * Age cannot be derived without knowing which field to read, and an org
     * may well have several date fields (joined on, medical check expiry).
     * Enforced as at most one per organization below.
     */
    isDateOfBirth: boolean("is_date_of_birth").notNull().default(false),
    /**
     * Who may read the answers. Defaults to the wider of the two, so adding
     * the column changes nothing about who sees what until an admin narrows
     * a field deliberately.
     */
    valueVisibility: memberCustomFieldVisibilityEnum("value_visibility")
      .notNull()
      .default("member_managers"),
    sensitivity: memberCustomFieldSensitivityEnum("sensitivity")
      .notNull()
      .default("normal"),
    /** Required once `sensitivity` is `special_category`; meaningless before. */
    art9Condition: memberCustomFieldArt9ConditionEnum("art9_condition"),
    /**
     * Why this field is collected, in the words of whoever created it.
     *
     * Required for special-category fields. This is the sentence that makes the
     * record of processing (MAR-138) writable and the one a member is owed an
     * answer with — a purpose reconstructed six months later by someone who did
     * not set the field up is a guess.
     */
    processingPurpose: text("processing_purpose"),
    /** How long answers are kept. Null means the organization's default. */
    retentionMonths: integer("retention_months"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("member_custom_fields_org_key_idx").on(table.orgId, table.key),
    uniqueIndex("member_custom_fields_org_dob_idx")
      .on(table.orgId)
      .where(sql`is_date_of_birth`),
    // A special-category field without a condition and a purpose is a field
    // nobody can justify holding. Enforced here as well as in the form,
    // because an import or a script is not going through the form.
    check(
      "member_custom_fields_special_category_check",
      sql`${table.sensitivity} = 'normal' OR (${table.art9Condition} IS NOT NULL AND ${table.processingPurpose} IS NOT NULL)`,
    ),
    check(
      "member_custom_fields_retention_check",
      sql`${table.retentionMonths} IS NULL OR ${table.retentionMonths} > 0`,
    ),
    index("member_custom_fields_org_sort_idx").on(table.orgId, table.sortOrder),
    index("member_custom_fields_org_stage_idx").on(table.orgId, table.stage),
    check(
      "member_custom_fields_sort_order_check",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export type CustomFieldValue = string | number | boolean | string[] | null;

export const memberCustomFieldValues = pgTable(
  "member_custom_field_values",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => memberCustomFields.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<CustomFieldValue>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("member_custom_field_values_member_field_idx").on(
      table.memberId,
      table.fieldId,
    ),
    index("member_custom_field_values_org_member_idx").on(
      table.orgId,
      table.memberId,
    ),
    index("member_custom_field_values_org_field_idx").on(
      table.orgId,
      table.fieldId,
    ),
  ],
);

export const memberInvites = pgTable(
  "member_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    provisionedUserId: text("provisioned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    claimedUserId: text("claimed_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: memberInviteStatusEnum("status").notNull().default("pending"),
    deliveryStatus: memberInviteDeliveryStatusEnum("delivery_status")
      .notNull()
      .default("pending"),
    tokenHash: text("token_hash"),
    providerEmailId: text("provider_email_id"),
    resetTokenExpiresAt: timestamp("reset_token_expires_at", { withTimezone: true }),
    resendAvailableAt: timestamp("resend_available_at", { withTimezone: true }),
    deliveryUpdatedAt: timestamp("delivery_updated_at", { withTimezone: true }),
    lastDeliveryEvent: text("last_delivery_event"),
    activationAttemptCount: integer("activation_attempt_count").notNull().default(0),
    lastActivationAttemptAt: timestamp("last_activation_attempt_at", { withTimezone: true }),
    activationBlockedUntil: timestamp("activation_blocked_until", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    resendCount: integer("resend_count").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("member_invites_member_idx").on(table.memberId),
    uniqueIndex("member_invites_provider_email_idx")
      .on(table.providerEmailId)
      .where(sql`provider_email_id IS NOT NULL`),
    index("member_invites_org_status_idx").on(table.orgId, table.status),
    index("member_invites_org_delivery_status_idx").on(
      table.orgId,
      table.deliveryStatus,
    ),
  ],
);

export const memberAuthEvents = pgTable(
  "member_auth_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tenantMembers.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    inviteId: uuid("invite_id").references(() => memberInvites.id, { onDelete: "set null" }),
    eventType: memberAuthEventTypeEnum("event_type").notNull(),
    message: text("message"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    ...timestamps,
  },
  (table) => [
    index("member_auth_events_org_member_created_idx").on(
      table.orgId,
      table.memberId,
      table.createdAt,
    ),
    index("member_auth_events_org_event_type_idx").on(
      table.orgId,
      table.eventType,
    ),
  ],
);

export const workspaceConnections = pgTable(
  "workspace_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    accessToken: text("access_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    grantedByUserId: text("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    grantedByEmail: text("granted_by_email"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_connections_org_idx").on(table.orgId),
  ],
);

/**
 * A one-to-one link between a Spoleek group and a Google group. Keyed on the
 * immutable Google group id — the email is cached for display and refreshed on
 * each sync, so renaming the group in the Admin console does not break the
 * link.
 */
export const groupWorkspaceLinks = pgTable(
  "group_workspace_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    workspaceGroupId: text("workspace_group_id").notNull(),
    workspaceGroupEmail: text("workspace_group_email").notNull(),
    workspaceGroupName: text("workspace_group_name"),
    direction: workspaceLinkDirectionEnum("direction").notNull().default("push"),
    memberRole: workspaceGroupRoleEnum("member_role").notNull().default("member"),
    adminRole: workspaceGroupRoleEnum("admin_role").notNull().default("manager"),
    removalPolicy: workspaceLinkRemovalPolicyEnum("removal_policy")
      .notNull()
      .default("remove_owned"),
    includeExternal: boolean("include_external").notNull().default(false),
    isEnabled: boolean("is_enabled").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncStatus: workspaceLinkSyncStatusEnum("last_sync_status")
      .notNull()
      .default("never"),
    lastSyncError: text("last_sync_error"),
    ...timestamps,
  },
  (table) => [
    // Strictly one-to-one, enforced in both directions: a Spoleek group has at
    // most one Google group, and a Google group is claimed by at most one
    // Spoleek group. Many-to-one roll-ups are a deliberate future feature.
    uniqueIndex("group_workspace_links_group_idx").on(table.groupId),
    uniqueIndex("group_workspace_links_org_target_idx").on(
      table.orgId,
      table.workspaceGroupId,
    ),
  ],
);

/**
 * Provenance ledger: one row per Google group membership Spoleek created. This
 * is what makes `remove_owned` and a truthful unlink dialog possible.
 */
export const workspaceGroupMemberLinks = pgTable(
  "workspace_group_member_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    linkId: uuid("link_id")
      .notNull()
      .references(() => groupWorkspaceLinks.id, { onDelete: "cascade" }),
    workspaceGroupId: text("workspace_group_id").notNull(),
    address: text("address").notNull(),
    memberId: uuid("member_id").references(() => tenantMembers.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_group_member_links_link_address_idx").on(
      table.linkId,
      table.address,
    ),
    index("workspace_group_member_links_org_target_idx").on(
      table.orgId,
      table.workspaceGroupId,
    ),
  ],
);

/**
 * Outbox. Membership mutations enqueue here inside the same transaction as the
 * `group_memberships` write, so a Google outage can never leave the two systems
 * permanently divergent, and assigning 200 members does not mean 200 serial API
 * calls inside one request.
 */
export const workspaceSyncOperations = pgTable(
  "workspace_sync_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    linkId: uuid("link_id")
      .notNull()
      .references(() => groupWorkspaceLinks.id, { onDelete: "cascade" }),
    kind: workspaceSyncOperationKindEnum("kind").notNull(),
    address: text("address").notNull(),
    role: workspaceGroupRoleEnum("role"),
    memberId: uuid("member_id").references(() => tenantMembers.id, {
      onDelete: "set null",
    }),
    status: workspaceSyncOperationStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    index("workspace_sync_operations_due_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
    index("workspace_sync_operations_link_idx").on(table.linkId, table.status),
    index("workspace_sync_operations_org_idx").on(table.orgId, table.status),
  ],
);

/**
 * Addresses found in a linked Google group that Spoleek does not have in the
 * roster. Persisted rather than recomputed on demand because finding drift
 * costs a `members.list` call per link — the nightly reconcile pays that price
 * once so every screen can render the count for free.
 */
export const workspaceGroupDrift = pgTable(
  "workspace_group_drift",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    linkId: uuid("link_id")
      .notNull()
      .references(() => groupWorkspaceLinks.id, { onDelete: "cascade" }),
    workspaceGroupId: text("workspace_group_id").notNull(),
    address: text("address").notNull(),
    role: workspaceGroupRoleEnum("role").notNull().default("member"),
    /** Google's member type — a nested group cannot become a Spoleek member. */
    memberType: text("member_type").notNull().default("USER"),
    /** Google's user id, so the row can link straight to the Admin console. */
    workspaceUserId: text("workspace_user_id"),
    status: workspaceDriftStatusEnum("status").notNull().default("open"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_group_drift_link_address_idx").on(
      table.linkId,
      table.address,
    ),
    index("workspace_group_drift_org_status_idx").on(table.orgId, table.status),
  ],
);

export const emailActivities = pgTable(
  "email_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    direction: emailDirectionEnum("direction").notNull().default("outbound"),
    kind: emailKindEnum("kind").notNull(),
    currentStatus: emailActivityStatusEnum("current_status").notNull(),
    memberId: uuid("member_id").references(() => tenantMembers.id, {
      onDelete: "set null",
    }),
    inviteId: uuid("invite_id").references(() => memberInvites.id, {
      onDelete: "set null",
    }),
    /** Set for `event_invite` so the per-event send log and copy lists agree. */
    eventId: uuid("event_id").references(() => events.id, {
      onDelete: "set null",
    }),
    resendOfEmailActivityId: uuid("resend_of_email_activity_id"),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    providerEmailId: text("provider_email_id"),
    fromEmail: text("from_email").notNull(),
    toEmail: text("to_email").notNull(),
    toName: text("to_name"),
    subject: text("subject").notNull(),
    providerEventType: text("provider_event_type"),
    lastError: text("last_error"),
    problemAt: timestamp("problem_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    complainedAt: timestamp("complained_at", { withTimezone: true }),
    suppressedAt: timestamp("suppressed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastStatusAt: timestamp("last_status_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("email_activities_provider_email_idx")
      .on(table.providerEmailId)
      .where(sql`provider_email_id IS NOT NULL`),
    index("email_activities_org_status_idx").on(
      table.orgId,
      table.currentStatus,
    ),
    index("email_activities_org_kind_idx").on(table.orgId, table.kind),
    index("email_activities_org_sent_idx").on(table.orgId, table.sentAt),
    index("email_activities_org_member_idx").on(table.orgId, table.memberId),
    index("email_activities_org_event_idx").on(table.orgId, table.eventId),
  ],
);

export const emailActivityEvents = pgTable(
  "email_activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    emailActivityId: uuid("email_activity_id")
      .notNull()
      .references(() => emailActivities.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: emailActivityEventTypeEnum("event_type").notNull(),
    providerEventType: text("provider_event_type"),
    message: text("message"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    index("email_activity_events_activity_occurred_idx").on(
      table.emailActivityId,
      table.occurredAt,
    ),
    index("email_activity_events_org_occurred_idx").on(
      table.orgId,
      table.occurredAt,
    ),
  ],
);

/**
 * A tracked payment: a membership fee or an event fee.
 *
 * Membership-fee rows are keyed by member and period (`member_id`,
 * `period_key`); event rows are keyed by the RSVP that owes them
 * (`response_id`), with `period_key = 'event:<eventId>'` so the shared title
 * helper keeps working. Guest rows have no member at all and read their name
 * and email through the response, which the retention shred anonymises — the
 * payment itself copies nothing. `response_id` is set null rather than
 * cascaded so a paid record outlives a deleted response.
 */
export const memberPayments = pgTable(
  "member_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => tenantMembers.id, {
      onDelete: "cascade",
    }),
    eventId: uuid("event_id").references(() => events.id, {
      onDelete: "cascade",
    }),
    responseId: uuid("response_id").references(() => eventResponses.id, {
      onDelete: "set null",
    }),
    type: memberPaymentTypeEnum("type").notNull().default("membership_fee"),
    status: memberPaymentStatusEnum("status").notNull().default("pending"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    bankAccount: text("bank_account"),
    periodLabel: text("period_label").notNull(),
    periodKey: text("period_key").notNull(),
    variableSymbol: text("variable_symbol"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    confirmedByUserId: text("confirmed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    adminNote: text("admin_note"),
    cancellationReason: text("cancellation_reason"),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("member_payments_org_member_idx").on(table.orgId, table.memberId),
    index("member_payments_org_status_idx").on(table.orgId, table.status),
    index("member_payments_org_period_key_idx").on(table.orgId, table.periodKey),
    uniqueIndex("member_payments_member_period_key_idx")
      .on(table.memberId, table.periodKey)
      .where(sql`type = 'membership_fee'`),
    // One live payment per response; a cancelled row may be followed by a new one.
    uniqueIndex("member_payments_response_live_idx")
      .on(table.responseId)
      .where(sql`response_id IS NOT NULL AND status <> 'cancelled'`),
    index("member_payments_org_event_idx").on(table.orgId, table.eventId),
    index("member_payments_org_vs_idx").on(table.orgId, table.variableSymbol),
    index("member_payments_member_status_idx").on(table.memberId, table.status),
    index("member_payments_org_due_at_idx").on(table.orgId, table.dueAt),
    check(
      "member_payments_amount_check",
      sql`${table.amount} > 0`,
    ),
    check(
      "member_payments_type_check",
      sql`(${table.type} = 'membership_fee' AND ${table.memberId} IS NOT NULL AND ${table.eventId} IS NULL AND ${table.responseId} IS NULL) OR (${table.type} = 'event' AND ${table.eventId} IS NOT NULL)`,
    ),
  ],
);

// ─── Yearly membership report ───────────────────────────────────────────────

/**
 * One reporting cycle for the organization.
 *
 * The period bounds and label are copied in at open time rather than derived
 * from the organization's current settings on every read. A report describes a
 * year that has already happened; if an admin later changes the renewal date or
 * switches period mode, last year's report must keep saying what it said.
 */
export const membershipReports = pgTable(
  "membership_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Human-facing name of the period, e.g. "2026". Matches `member_payments.period_label`. */
    periodLabel: text("period_label").notNull(),
    periodStart: date("period_start", { mode: "date" }).notNull(),
    periodEnd: date("period_end", { mode: "date" }).notNull(),
    /**
     * The organization's fee currency, copied at open time.
     *
     * One currency per organization is a hard rule — groups cannot override it
     * — but the report still snapshots it rather than joining live, for the
     * same reason it snapshots names and amounts: an organization that switches
     * currency must not retitle the totals of every year it already reported.
     */
    currency: text("currency"),
    /** Date by which every group must have submitted. Null means no deadline. */
    confirmDueAt: date("confirm_due_at", { mode: "date" }),
    status: membershipReportStatusEnum("status").notNull().default("draft"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /**
     * When the board digest last went out.
     *
     * The digest normally rides the group reminders' cadence, which the ladder
     * already rate-limits. It only needs a record of its own for the case where
     * every group has submitted and the board is the sole holdout — with no
     * group reminders to ride, it would otherwise send every morning.
     */
    digestSentAt: timestamp("digest_sent_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("membership_reports_org_period_idx").on(
      table.orgId,
      table.periodLabel,
    ),
    index("membership_reports_org_status_idx").on(table.orgId, table.status),
    check(
      "membership_reports_period_bounds_check",
      sql`${table.periodEnd} >= ${table.periodStart}`,
    ),
  ],
);

/**
 * One group's slice of a report, and the whole of its workflow state.
 *
 * The counts are cached at submit time. They are recomputable from
 * `membership_report_members`, but the board dashboard lists every group at
 * once and should not fan out a per-group aggregate to render a table.
 */
export const membershipReportGroups = pgTable(
  "membership_report_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reportId: uuid("report_id")
      .notNull()
      .references(() => membershipReports.id, { onDelete: "cascade" }),
    /**
     * Nulls out when the group is deleted; the row survives.
     *
     * `group_name` is copied precisely so a deleted group still reads
     * correctly, and an organization must be able to retire a region without
     * erasing the years it existed. A row with no group is history only: it
     * cannot be acted on, because authorization routes through the group.
     */
    groupId: uuid("group_id").references(() => groups.id, {
      onDelete: "set null",
    }),
    /** Copied at open time so a renamed or deleted group still reads correctly. */
    groupName: text("group_name").notNull(),
    status: membershipReportGroupStatusEnum("status")
      .notNull()
      .default("not_started"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedByMemberId: uuid("submitted_by_member_id").references(
      () => tenantMembers.id,
      { onDelete: "set null" },
    ),
    submissionNote: text("submission_note"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * Set when the approver is also the submitter. Only reachable while the
     * organization has `membershipReportAllowSelfApproval` on, and surfaced in
     * the UI so the exception stays visible after the setting changes back.
     */
    selfApproved: boolean("self_approved").notNull().default(false),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnedReason: text("returned_reason"),
    /**
     * The last rung of the reminder ladder sent for this group, and when.
     *
     * The cron runs daily against a single deadline, so without this the group
     * would be mailed "14 days left" every morning for a fortnight. The ladder
     * is monotonic, so "already at or past this rung" is one comparison and a
     * re-run cannot double-send. Cleared when the group is sent back, because
     * its position in the ladder is no longer where it was.
     */
    reminderStageSent: membershipReportReminderStageEnum("reminder_stage_sent"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    /**
     * When the group was last told it has members waiting to be accepted.
     *
     * Deliberately not part of the ladder above. The ladder counts down to the
     * confirmation deadline and its rungs were consumed before this group
     * submitted; a member confirmed afterwards is a new task on a roster that
     * is otherwise finished, and it can arrive at any time — including well
     * after the deadline, when the ladder has nothing left to say. Cleared when
     * the pending addition is dealt with, so the next one starts fresh.
     */
    pendingAdditionRemindedAt: timestamp("pending_addition_reminded_at", {
      withTimezone: true,
    }),
    memberCount: integer("member_count").notNull().default(0),
    paidCount: integer("paid_count").notNull().default(0),
    waivedCount: integer("waived_count").notNull().default(0),
    feeTotalCents: integer("fee_total_cents").notNull().default(0),
    currency: text("currency"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("membership_report_groups_report_group_idx").on(
      table.reportId,
      table.groupId,
    ),
    index("membership_report_groups_org_status_idx").on(
      table.orgId,
      table.status,
    ),
    index("membership_report_groups_group_idx").on(table.groupId),
  ],
);

/**
 * The frozen roster: who this group reported for this period.
 *
 * Names are copied rather than joined. `group_memberships` has no validity
 * period, so a live join would silently rewrite history the moment someone
 * changes region — and a member deleted under GDPR would erase the count they
 * were part of. The FK nulls out instead, and the name columns can be scrubbed
 * on their own without destroying the report.
 */
export const membershipReportMembers = pgTable(
  "membership_report_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reportGroupId: uuid("report_group_id")
      .notNull()
      .references(() => membershipReportGroups.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => tenantMembers.id, {
      onDelete: "set null",
    }),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    confirmationBasis: membershipReportConfirmationBasisEnum(
      "confirmation_basis",
    ).notNull(),
    /** The payment that confirmed this member, when there was one. */
    paymentId: uuid("payment_id").references(() => memberPayments.id, {
      onDelete: "set null",
    }),
    feeAmountCents: integer("fee_amount_cents"),
    currency: text("currency"),
    included: boolean("included").notNull().default(true),
    /**
     * True when the member was confirmed after the group had already submitted.
     * They are held out of the counts until a group admin accepts them, which
     * sends the group back to `returned` for the board to re-approve.
     */
    pendingAddition: boolean("pending_addition").notNull().default(false),
    /** Required when `confirmationBasis` is `manual` or when `included` is false. */
    note: text("note"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("membership_report_members_group_member_idx").on(
      table.reportGroupId,
      table.memberId,
    ),
    index("membership_report_members_org_idx").on(table.orgId),
    index("membership_report_members_member_idx").on(table.memberId),
    index("membership_report_members_pending_idx")
      .on(table.reportGroupId)
      .where(sql`pending_addition`),
  ],
);

// ─── Events ─────────────────────────────────────────────────────────────────

/**
 * An event with a built-in RSVP.
 *
 * Owner and audience are separate on purpose. The owner (`ownerType` plus the
 * one matching id) decides who manages the event and where it is listed; the
 * audience (`event_audience`) decides who is invited. A troop's camp is owned
 * by that troop but may invite a second troop and two parents — collapsing
 * the two into one column would force either a fake owner or a fake invitee.
 *
 * Dates are optional so a "save the date" can be published before the
 * schedule is known; the CHECK only insists that an end without a start is
 * meaningless. `capacity` is the number of confirmed seats including guests;
 * the reserve list is whoever said yes once it was full.
 *
 * Price is per person in minor units and null means a free event; the bank
 * account and due date fall back to the organization's fee account and the
 * RSVP deadline (then the start date) when unset.
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Derived from `title` with the same helper groups use; editable. */
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    /** Sanitized Tiptap output, same editor and sanitizer as policy versions. */
    descriptionHtml: text("description_html"),
    ownerType: eventOwnerTypeEnum("owner_type").notNull(),
    ownerCategoryId: uuid("owner_category_id").references(
      () => groupCategories.id,
      { onDelete: "cascade" },
    ),
    ownerGroupId: uuid("owner_group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    visibility: eventVisibilityEnum("visibility").notNull().default("targeted"),
    status: eventStatusEnum("status").notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    /** Set by the creator ("answer a week before"). Null means open until the event is over. */
    rsvpDeadlineAt: timestamp("rsvp_deadline_at", { withTimezone: true }),
    /** Confirmed seats including guests. Null means unlimited. */
    capacity: integer("capacity"),
    maxGuestsPerResponse: integer("max_guests_per_response").notNull().default(0),
    priceAmount: integer("price_amount"),
    priceCurrency: text("price_currency"),
    priceBankAccount: text("price_bank_account"),
    paymentDueAt: timestamp("payment_due_at", { withTimezone: true }),
    locationName: text("location_name"),
    locationAddress: text("location_address"),
    /** WhatsApp / Facebook / etc. group for the event, shown to invitees. */
    communicationLink: text("communication_link"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("events_org_slug_idx").on(table.orgId, table.slug),
    index("events_org_status_starts_idx").on(
      table.orgId,
      table.status,
      table.startsAt,
    ),
    index("events_org_owner_group_idx").on(table.orgId, table.ownerGroupId),
    index("events_org_owner_category_idx").on(table.orgId, table.ownerCategoryId),
    // Exactly the id matching `ownerType` is set; `organization` sets neither.
    check(
      "events_owner_check",
      sql`(${table.ownerType} = 'organization' AND ${table.ownerCategoryId} IS NULL AND ${table.ownerGroupId} IS NULL) OR (${table.ownerType} = 'category' AND ${table.ownerCategoryId} IS NOT NULL AND ${table.ownerGroupId} IS NULL) OR (${table.ownerType} = 'group' AND ${table.ownerGroupId} IS NOT NULL AND ${table.ownerCategoryId} IS NULL)`,
    ),
    check(
      "events_dates_check",
      sql`${table.endsAt} IS NULL OR (${table.startsAt} IS NOT NULL AND ${table.endsAt} >= ${table.startsAt})`,
    ),
    check("events_capacity_check", sql`${table.capacity} IS NULL OR ${table.capacity} > 0`),
    check("events_max_guests_check", sql`${table.maxGuestsPerResponse} >= 0`),
    check(
      "events_price_amount_check",
      sql`${table.priceAmount} IS NULL OR ${table.priceAmount} > 0`,
    ),
    check(
      "events_price_currency_check",
      sql`(${table.priceAmount} IS NULL) = (${table.priceCurrency} IS NULL)`,
    ),
  ],
);

/**
 * Audience rules for a targeted event.
 *
 * Rules, not rows: eligibility is computed from `group_memberships` at read
 * time, so a member who joins the troop after the invite went out is invited
 * and one who leaves is not — there is no snapshot to drift. Rows are only
 * read when `visibility = 'targeted'` but are kept for the other visibilities
 * so toggling back and forth does not lose the list. `external` rules are not
 * members and are reached only by RSVP token.
 */
export const eventAudience = pgTable(
  "event_audience",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: eventAudienceKindEnum("kind").notNull(),
    groupId: uuid("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    categoryId: uuid("category_id").references(() => groupCategories.id, {
      onDelete: "cascade",
    }),
    memberId: uuid("member_id").references(() => tenantMembers.id, {
      onDelete: "cascade",
    }),
    externalEmail: text("external_email"),
    externalName: text("external_name"),
    ...timestamps,
  },
  (table) => [
    // One partial unique index per kind stands in for a single unique over
    // `(eventId, kind, coalesce(...))`, which Postgres cannot express directly.
    uniqueIndex("event_audience_event_group_idx")
      .on(table.eventId, table.groupId)
      .where(sql`kind = 'group'`),
    uniqueIndex("event_audience_event_category_idx")
      .on(table.eventId, table.categoryId)
      .where(sql`kind = 'category'`),
    uniqueIndex("event_audience_event_member_idx")
      .on(table.eventId, table.memberId)
      .where(sql`kind = 'member'`),
    uniqueIndex("event_audience_event_external_idx")
      .on(table.eventId, sql`lower(${table.externalEmail})`)
      .where(sql`kind = 'external'`),
    index("event_audience_org_event_idx").on(table.orgId, table.eventId),
    index("event_audience_member_idx").on(table.memberId),
    check(
      "event_audience_kind_check",
      sql`(${table.kind} = 'group' AND ${table.groupId} IS NOT NULL AND ${table.categoryId} IS NULL AND ${table.memberId} IS NULL AND ${table.externalEmail} IS NULL) OR (${table.kind} = 'category' AND ${table.categoryId} IS NOT NULL AND ${table.groupId} IS NULL AND ${table.memberId} IS NULL AND ${table.externalEmail} IS NULL) OR (${table.kind} = 'member' AND ${table.memberId} IS NOT NULL AND ${table.groupId} IS NULL AND ${table.categoryId} IS NULL AND ${table.externalEmail} IS NULL) OR (${table.kind} = 'external' AND ${table.externalEmail} IS NOT NULL AND ${table.groupId} IS NULL AND ${table.categoryId} IS NULL AND ${table.memberId} IS NULL)`,
    ),
  ],
);

/**
 * One RSVP per person per event.
 *
 * A responder is either a member (`memberId`) or a guest (`guestEmail`), never
 * both, so a member who also answers anonymously on the public page is two
 * rows — the manager can see and merge that, the schema cannot. `standing` is
 * only meaningful for `yes`; other answers are stored as `confirmed` so the
 * seat count is a single `WHERE answer = 'yes' AND standing = 'confirmed'`.
 * Guest identity columns are nullable so the retention cron can shred them
 * while keeping the headcount.
 */
export const eventResponses = pgTable(
  "event_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => tenantMembers.id, {
      onDelete: "cascade",
    }),
    guestEmail: text("guest_email"),
    guestName: text("guest_name"),
    answer: eventRsvpAnswerEnum("answer").notNull(),
    /** Upper bound enforced in the action against `events.maxGuestsPerResponse`. */
    guestCount: integer("guest_count").notNull().default(0),
    standing: eventRsvpStandingEnum("standing").notNull().default("confirmed"),
    /** First answer; reserve order is this ascending. Not bumped on change. */
    respondedAt: timestamp("responded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Set on manual promotion from the reserve list. */
    confirmedByUserId: text("confirmed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("event_responses_event_member_idx")
      .on(table.eventId, table.memberId)
      .where(sql`member_id IS NOT NULL`),
    uniqueIndex("event_responses_event_guest_email_idx")
      .on(table.eventId, sql`lower(${table.guestEmail})`)
      .where(sql`guest_email IS NOT NULL`),
    index("event_responses_org_event_idx").on(table.orgId, table.eventId),
    index("event_responses_member_idx").on(table.memberId),
    index("event_responses_event_answer_standing_idx").on(
      table.eventId,
      table.answer,
      table.standing,
    ),
    // Guest rows keep their answer after shredding, so the "exactly one of"
    // rule is relaxed to "at most one": a row with neither is an anonymised
    // guest, never a member.
    check(
      "event_responses_responder_check",
      sql`${table.memberId} IS NULL OR ${table.guestEmail} IS NULL`,
    ),
    check("event_responses_guest_count_check", sql`${table.guestCount} >= 0`),
  ],
);

/**
 * Login-free RSVP links for shadow members, non-activated members and
 * external guests.
 *
 * There is no `expiresAt`: validity is derived from the live event (published,
 * before the deadline, not over) with a 90-day fallback from `issuedAt` when
 * the event has no dates. A stored expiry would silently outlive a moved
 * deadline or cut off a postponed event. One live token per holder per event;
 * re-issuing replaces the row.
 */
export const eventRsvpTokens = pgTable(
  "event_rsvp_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => tenantMembers.id, {
      onDelete: "cascade",
    }),
    externalEmail: text("external_email"),
    /** sha256 of 32 random bytes; the raw token is shown once and never stored. */
    tokenHash: text("token_hash").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("event_rsvp_tokens_hash_idx").on(table.tokenHash),
    uniqueIndex("event_rsvp_tokens_event_member_idx")
      .on(table.eventId, table.memberId)
      .where(sql`member_id IS NOT NULL`),
    uniqueIndex("event_rsvp_tokens_event_external_idx")
      .on(table.eventId, sql`lower(${table.externalEmail})`)
      .where(sql`external_email IS NOT NULL`),
    index("event_rsvp_tokens_org_event_idx").on(table.orgId, table.eventId),
    check(
      "event_rsvp_tokens_holder_check",
      sql`(${table.memberId} IS NOT NULL AND ${table.externalEmail} IS NULL) OR (${table.memberId} IS NULL AND ${table.externalEmail} IS NOT NULL)`,
    ),
  ],
);

// ─── Forms ──────────────────────────────────────────────────────────────────

/**
 * A form: a standalone questionnaire optionally linked to one event.
 *
 * Kept separate from the RSVP so a "yes" and the dietary sheet are two rows
 * with two lifetimes. A template is just a form with `isTemplate` set, no
 * event and organization ownership; creating a form from it deep-copies the
 * questions and the two never touch again — a template edit must not
 * silently change a form that is already collecting answers. Ownership
 * mirrors `events` (same enum, same CHECK) so the same access table applies.
 */
export const forms = pgTable(
  "forms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Plain text shown above the questions. */
    description: text("description"),
    isTemplate: boolean("is_template").notNull().default(false),
    ownerType: eventOwnerTypeEnum("owner_type").notNull(),
    ownerCategoryId: uuid("owner_category_id").references(
      () => groupCategories.id,
      { onDelete: "cascade" },
    ),
    ownerGroupId: uuid("owner_group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    /** Set null on event deletion: the form and its answers outlive the event. */
    eventId: uuid("event_id").references(() => events.id, {
      onDelete: "set null",
    }),
    timing: formTimingEnum("timing").notNull().default("anytime"),
    /** Drives pending badges and the reminder list; never blocks anything. */
    required: boolean("required").notNull().default(false),
    /** Only meaningful when `eventId` is set. */
    onlyRsvpYes: boolean("only_rsvp_yes").notNull().default(false),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    /** Only read when `eventId IS NULL`; a linked form follows the event. */
    visibility: formVisibilityEnum("visibility").notNull().default("org"),
    status: formStatusEnum("status").notNull().default("draft"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("forms_org_event_idx").on(table.orgId, table.eventId),
    index("forms_org_template_idx").on(table.orgId, table.isTemplate),
    index("forms_org_status_idx").on(table.orgId, table.status),
    index("forms_org_owner_group_idx").on(table.orgId, table.ownerGroupId),
    index("forms_org_owner_category_idx").on(table.orgId, table.ownerCategoryId),
    // Exactly the id matching `ownerType` is set; `organization` sets neither.
    check(
      "forms_owner_check",
      sql`(${table.ownerType} = 'organization' AND ${table.ownerCategoryId} IS NULL AND ${table.ownerGroupId} IS NULL) OR (${table.ownerType} = 'category' AND ${table.ownerCategoryId} IS NOT NULL AND ${table.ownerGroupId} IS NULL) OR (${table.ownerType} = 'group' AND ${table.ownerGroupId} IS NOT NULL AND ${table.ownerCategoryId} IS NULL)`,
    ),
    // A template is org-wide and never attached to an event.
    check(
      "forms_template_owner_check",
      sql`${table.isTemplate} = false OR ${table.ownerType} = 'organization'`,
    ),
    check(
      "forms_template_event_check",
      sql`${table.isTemplate} = false OR ${table.eventId} IS NULL`,
    ),
  ],
);

/**
 * One question or section heading on a form.
 *
 * Questions reuse the custom-field type system. A question linked to a member
 * custom field (`memberFieldId`) carries a *snapshot* of the field's `type`,
 * `options` and `constraints` taken when it was saved; the server re-reads
 * the live field on render and on submit, so the copy only matters if the
 * field is later deleted — the link is nulled and the question keeps working
 * unlinked. A special-category question can never be linked (custom field
 * values are not encrypted yet) and must carry a TTL, so sensitive answers
 * are always on their way out.
 */
export const formQuestions = pgTable(
  "form_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    kind: formQuestionKindEnum("kind").notNull(),
    /** Question label or section heading. */
    label: text("label").notNull(),
    /** Sanitized Tiptap output: instructions for a section, help text for an input. */
    descriptionHtml: text("description_html"),
    /** Null only for sections. */
    type: memberCustomFieldTypeEnum("type"),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    constraints: jsonb("constraints")
      .$type<MemberCustomFieldConstraints>()
      .notNull()
      .default({}),
    required: boolean("required").notNull().default(false),
    memberFieldId: uuid("member_field_id").references(
      () => memberCustomFields.id,
      { onDelete: "set null" },
    ),
    profileSync: formProfileSyncEnum("profile_sync").notNull().default("none"),
    sensitivity: memberCustomFieldSensitivityEnum("sensitivity")
      .notNull()
      .default("normal"),
    /** Required once `sensitivity` is `special_category`; meaningless before. */
    art9Condition: memberCustomFieldArt9ConditionEnum("art9_condition"),
    processingPurpose: text("processing_purpose"),
    valueVisibility: memberCustomFieldVisibilityEnum("value_visibility")
      .notNull()
      .default("member_managers"),
    /**
     * Answers are nulled this many days after the anchor (the event's end, or
     * `closesAt` for an unlinked form). Null means kept with the submission.
     */
    shredAfterEventDays: integer("shred_after_event_days"),
    ...timestamps,
  },
  (table) => [
    index("form_questions_form_sort_idx").on(table.formId, table.sortOrder),
    index("form_questions_org_member_field_idx").on(
      table.orgId,
      table.memberFieldId,
    ),
    check("form_questions_sort_order_check", sql`${table.sortOrder} >= 0`),
    check(
      "form_questions_type_check",
      sql`${table.kind} = 'section' OR ${table.type} IS NOT NULL`,
    ),
    check(
      "form_questions_profile_sync_check",
      sql`${table.profileSync} = 'none' OR ${table.memberFieldId} IS NOT NULL`,
    ),
    check(
      "form_questions_art9_check",
      sql`${table.sensitivity} = 'normal' OR (${table.art9Condition} IS NOT NULL AND ${table.processingPurpose} IS NOT NULL)`,
    ),
    // Sensitive answers are never synced to a plaintext profile and always
    // expire. Enforced here as well as in the editor, because a script is not
    // going through the editor.
    check(
      "form_questions_special_category_check",
      sql`${table.sensitivity} = 'normal' OR (${table.memberFieldId} IS NULL AND ${table.shredAfterEventDays} IS NOT NULL)`,
    ),
    check(
      "form_questions_shred_days_check",
      sql`${table.shredAfterEventDays} IS NULL OR ${table.shredAfterEventDays} > 0`,
    ),
  ],
);

/**
 * Audience rules for an unlinked, targeted form.
 *
 * Same shape and reasoning as `event_audience` (rules, not rows), minus
 * `external` — there is no event to hang a token on. `scope` narrows a group
 * or category rule to its admins and is ignored for `member`. Rows are only
 * read when `eventId IS NULL AND visibility = 'targeted'` but are kept
 * otherwise so toggling does not lose the list.
 */
export const formAudience = pgTable(
  "form_audience",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    kind: formAudienceKindEnum("kind").notNull(),
    groupId: uuid("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    categoryId: uuid("category_id").references(() => groupCategories.id, {
      onDelete: "cascade",
    }),
    memberId: uuid("member_id").references(() => tenantMembers.id, {
      onDelete: "cascade",
    }),
    scope: formAudienceScopeEnum("scope").notNull().default("members"),
    ...timestamps,
  },
  (table) => [
    // One partial unique index per kind stands in for a single unique over
    // `(formId, kind, coalesce(...), scope)`, which Postgres cannot express.
    uniqueIndex("form_audience_form_group_idx")
      .on(table.formId, table.groupId, table.scope)
      .where(sql`kind = 'group'`),
    uniqueIndex("form_audience_form_category_idx")
      .on(table.formId, table.categoryId, table.scope)
      .where(sql`kind = 'category'`),
    uniqueIndex("form_audience_form_member_idx")
      .on(table.formId, table.memberId)
      .where(sql`kind = 'member'`),
    index("form_audience_org_form_idx").on(table.orgId, table.formId),
    index("form_audience_member_idx").on(table.memberId),
    check(
      "form_audience_kind_check",
      sql`(${table.kind} = 'group' AND ${table.groupId} IS NOT NULL AND ${table.categoryId} IS NULL AND ${table.memberId} IS NULL) OR (${table.kind} = 'category' AND ${table.categoryId} IS NOT NULL AND ${table.groupId} IS NULL AND ${table.memberId} IS NULL) OR (${table.kind} = 'member' AND ${table.memberId} IS NOT NULL AND ${table.groupId} IS NULL AND ${table.categoryId} IS NULL)`,
    ),
  ],
);

/**
 * One submission per person per form.
 *
 * A submitter is a member (`memberId`) or a guest (`guestEmail`), never both.
 * Guest identity columns are nullable so the retention cron can anonymise
 * them while keeping the row, hence "at most one" rather than "exactly one"
 * in the CHECK — the same relaxation as `event_responses`. `submittedByUserId`
 * is set only when a manager submitted or edited on someone's behalf, so
 * "who typed this" is never lost. `shreddedAt` records that every answer to a
 * shreddable question has been nulled.
 */
export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => tenantMembers.id, {
      onDelete: "cascade",
    }),
    guestEmail: text("guest_email"),
    guestName: text("guest_name"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedByUserId: text("submitted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    shreddedAt: timestamp("shredded_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("form_submissions_form_member_idx")
      .on(table.formId, table.memberId)
      .where(sql`member_id IS NOT NULL`),
    uniqueIndex("form_submissions_form_guest_email_idx")
      .on(table.formId, sql`lower(${table.guestEmail})`)
      .where(sql`guest_email IS NOT NULL`),
    index("form_submissions_org_form_idx").on(table.orgId, table.formId),
    index("form_submissions_org_member_idx").on(table.orgId, table.memberId),
    check(
      "form_submissions_submitter_check",
      sql`${table.memberId} IS NULL OR ${table.guestEmail} IS NULL`,
    ),
  ],
);

/**
 * One answer per question per submission.
 *
 * Answers to `normal` questions are plaintext in `value` so aggregates and
 * exports stay a SQL query. Answers to `special_category` questions live only
 * in `encryptedValue` (a `lib/crypto.ts` envelope of the JSON value) and
 * never in `value` — the CHECK makes a plaintext leak a constraint violation
 * rather than a code-review catch. Both nulled by the retention cron once the
 * question's TTL has passed.
 */
export const formAnswers = pgTable(
  "form_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => formSubmissions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => formQuestions.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<CustomFieldValue>(),
    encryptedValue: text("encrypted_value"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("form_answers_submission_question_idx").on(
      table.submissionId,
      table.questionId,
    ),
    index("form_answers_org_question_idx").on(table.orgId, table.questionId),
    check(
      "form_answers_value_check",
      sql`${table.value} IS NULL OR ${table.encryptedValue} IS NULL`,
    ),
  ],
);

/**
 * Fixed-window counters for public, unauthenticated endpoints.
 *
 * In the database rather than in memory because the app runs as serverless
 * functions: an in-process counter is per-instance and resets on every cold
 * start, which makes it a comment rather than a control.
 *
 * `key` is already hashed by the caller and never holds a raw address. The
 * table exists to bound abuse of `/join`, which accepts a name and email
 * address *about another person* from anyone who can reach the page — so it
 * must not itself become a log of who visited. Rows are disposable: anything
 * past `expiresAt` is deleted rather than kept for analysis.
 */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** `<scope>:<sha256 of the identifier>`. Never the identifier itself. */
    key: text("key").notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("rate_limit_buckets_key_idx").on(table.key),
    index("rate_limit_buckets_expires_idx").on(table.expiresAt),
  ],
);

export const schema = {
  users,
  sessions,
  accounts,
  verifications,
  organizations,
  organizationPolicies,
  policyDocuments,
  policyVersions,
  memberPolicyAcknowledgements,
  tenantMembers,
  groupCategories,
  groups,
  groupMemberships,
  categoryAdminAssignments,
  memberCustomFields,
  memberCustomFieldValues,
  memberInvites,
  memberAuthEvents,
  workspaceConnections,
  groupWorkspaceLinks,
  workspaceGroupMemberLinks,
  workspaceSyncOperations,
  workspaceGroupDrift,
  emailActivities,
  emailActivityEvents,
  memberPayments,
  membershipReports,
  membershipReportGroups,
  membershipReportMembers,
  events,
  eventAudience,
  eventResponses,
  eventRsvpTokens,
  forms,
  formQuestions,
  formAudience,
  formSubmissions,
  formAnswers,
  rateLimitBuckets,
};

export type SystemRole = typeof systemRoleEnum.enumValues[number];
export type TenantRole = typeof tenantRoleEnum.enumValues[number];
export type MembershipStatus = typeof membershipStatusEnum.enumValues[number];
export type MemberDeletionReason =
  typeof memberDeletionReasonEnum.enumValues[number];
export type MemberInviteStatus = typeof memberInviteStatusEnum.enumValues[number];
export type MemberInviteDeliveryStatus =
  typeof memberInviteDeliveryStatusEnum.enumValues[number];
export type MemberAuthEventType = typeof memberAuthEventTypeEnum.enumValues[number];
export type EmailDirection = typeof emailDirectionEnum.enumValues[number];
export type EmailKind = typeof emailKindEnum.enumValues[number];
export type EmailActivityStatus = typeof emailActivityStatusEnum.enumValues[number];
export type EmailActivityEventType =
  typeof emailActivityEventTypeEnum.enumValues[number];
export type MemberCustomFieldType = typeof memberCustomFieldTypeEnum.enumValues[number];
export type MemberCustomFieldStage = typeof memberCustomFieldStageEnum.enumValues[number];
export type MemberCustomFieldDiscoveryMode = typeof memberCustomFieldDiscoveryModeEnum.enumValues[number];
export type MemberCustomFieldVisibility =
  typeof memberCustomFieldVisibilityEnum.enumValues[number];
export type MemberCustomFieldSensitivity =
  typeof memberCustomFieldSensitivityEnum.enumValues[number];
export type MemberCustomFieldArt9Condition =
  typeof memberCustomFieldArt9ConditionEnum.enumValues[number];
export type GroupCategorySelectionMode =
  typeof groupCategorySelectionModeEnum.enumValues[number];
export type GroupJoinPolicy = typeof groupJoinPolicyEnum.enumValues[number];
export type GroupMembershipRole = typeof groupMembershipRoleEnum.enumValues[number];
export type MembershipManagementMode = typeof membershipManagementModeEnum.enumValues[number];
export type MaximumAgeEffect = typeof maximumAgeEffectEnum.enumValues[number];
export type MemberPreferredEmail = typeof memberPreferredEmailEnum.enumValues[number];
export type MemberPaymentType = typeof memberPaymentTypeEnum.enumValues[number];
export type MemberPaymentStatus = typeof memberPaymentStatusEnum.enumValues[number];
export type MemberPayment = typeof memberPayments.$inferSelect;
export type MembershipPeriodMode = typeof membershipPeriodModeEnum.enumValues[number];
export type MembershipReportStatus = typeof membershipReportStatusEnum.enumValues[number];
export type MembershipReportGroupStatus =
  typeof membershipReportGroupStatusEnum.enumValues[number];
export type MembershipReportConfirmationBasis =
  typeof membershipReportConfirmationBasisEnum.enumValues[number];
export type MembershipReportReminderStage =
  typeof membershipReportReminderStageEnum.enumValues[number];
export type MembershipReport = typeof membershipReports.$inferSelect;
export type MembershipReportGroup = typeof membershipReportGroups.$inferSelect;
export type MembershipReportMember = typeof membershipReportMembers.$inferSelect;
export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationPolicy = typeof organizationPolicies.$inferSelect;
export type PolicyDocumentKind = typeof policyDocumentKindEnum.enumValues[number];
export type PolicyVersionStatus = typeof policyVersionStatusEnum.enumValues[number];
export type PolicyAcknowledgementMethod =
  typeof policyAcknowledgementMethodEnum.enumValues[number];
export type PolicyDocument = typeof policyDocuments.$inferSelect;
export type PolicyVersion = typeof policyVersions.$inferSelect;
export type MemberPolicyAcknowledgement =
  typeof memberPolicyAcknowledgements.$inferSelect;
export type TenantMember = typeof tenantMembers.$inferSelect;
export type GroupCategory = typeof groupCategories.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupMembership = typeof groupMemberships.$inferSelect;
export type CategoryAdminAssignment = typeof categoryAdminAssignments.$inferSelect;
export type MemberCustomField = typeof memberCustomFields.$inferSelect;
export type MemberCustomFieldValue = typeof memberCustomFieldValues.$inferSelect;
export type MemberInvite = typeof memberInvites.$inferSelect;
export type MemberAuthEvent = typeof memberAuthEvents.$inferSelect;
export type WorkspaceConnection = typeof workspaceConnections.$inferSelect;
export type WorkspaceLinkDirection = typeof workspaceLinkDirectionEnum.enumValues[number];
export type WorkspaceGroupRole = typeof workspaceGroupRoleEnum.enumValues[number];
export type WorkspaceLinkRemovalPolicy =
  typeof workspaceLinkRemovalPolicyEnum.enumValues[number];
export type WorkspaceLinkSyncStatus =
  typeof workspaceLinkSyncStatusEnum.enumValues[number];
export type WorkspaceSyncOperationKind =
  typeof workspaceSyncOperationKindEnum.enumValues[number];
export type GroupWorkspaceLink = typeof groupWorkspaceLinks.$inferSelect;
export type WorkspaceGroupMemberLink = typeof workspaceGroupMemberLinks.$inferSelect;
export type WorkspaceSyncOperation = typeof workspaceSyncOperations.$inferSelect;
export type WorkspaceDriftStatus = typeof workspaceDriftStatusEnum.enumValues[number];
export type WorkspaceGroupDrift = typeof workspaceGroupDrift.$inferSelect;
export type EmailActivity = typeof emailActivities.$inferSelect;
export type EmailActivityEvent = typeof emailActivityEvents.$inferSelect;
export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
export type EventOwnerType = typeof eventOwnerTypeEnum.enumValues[number];
export type EventVisibility = typeof eventVisibilityEnum.enumValues[number];
export type EventStatus = typeof eventStatusEnum.enumValues[number];
export type EventAudienceKind = typeof eventAudienceKindEnum.enumValues[number];
export type EventRsvpAnswer = typeof eventRsvpAnswerEnum.enumValues[number];
export type EventRsvpStanding = typeof eventRsvpStandingEnum.enumValues[number];
export type OrgEventCreators = typeof orgEventCreatorsEnum.enumValues[number];
export type Event = typeof events.$inferSelect;
export type EventAudienceRule = typeof eventAudience.$inferSelect;
export type EventResponse = typeof eventResponses.$inferSelect;
export type EventRsvpToken = typeof eventRsvpTokens.$inferSelect;
export type FormTiming = typeof formTimingEnum.enumValues[number];
export type FormStatus = typeof formStatusEnum.enumValues[number];
export type FormVisibility = typeof formVisibilityEnum.enumValues[number];
export type FormQuestionKind = typeof formQuestionKindEnum.enumValues[number];
export type FormProfileSync = typeof formProfileSyncEnum.enumValues[number];
export type FormAudienceKind = typeof formAudienceKindEnum.enumValues[number];
export type FormAudienceScope = typeof formAudienceScopeEnum.enumValues[number];
export type Form = typeof forms.$inferSelect;
export type FormQuestion = typeof formQuestions.$inferSelect;
export type FormAudienceRule = typeof formAudience.$inferSelect;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type FormAnswer = typeof formAnswers.$inferSelect;
