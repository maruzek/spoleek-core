import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { resolveEligibleMemberIds } from "@/lib/events/eligibility";
import {
  canSubmit,
  getFormPlacement,
  isFormOpen,
  isPending,
  type FormPlacement,
  type FormOpenResult,
} from "@/lib/forms/rules";
import { resolveQuestionShape } from "@/lib/forms/validation";
import type { Viewer } from "@/lib/access/viewer";

import { db } from "@/server/db";
import {
  eventAudience,
  eventResponses,
  events,
  formAnswers,
  formAudience,
  formQuestions,
  formSubmissions,
  forms,
  groupCategories,
  groups,
  memberCustomFields,
  organizations,
  tenantMembers,
  type CustomFieldValue,
  type Event,
  type EventRsvpAnswer,
  type Form,
  type FormAnswer,
  type FormQuestion,
  type FormSubmission,
  type MemberCustomField,
} from "@/server/db/schema";
import { readAnswer, type ReadAnswerResult } from "@/server/lib/forms/answers";
import { viewerOf, type SubmissionIdentity } from "@/server/lib/forms/submissions";
import type { FieldViewerAccess } from "@/server/lib/member-field-visibility";
import { resolveMemberEmailForOrg } from "@/server/lib/preferred-email";
import { listManageableOwners, requireGroupAdminModuleAccess } from "@/server/queries/access";
import { listEligibleMemberIds, loadAudienceSnapshot } from "@/server/queries/event-eligibility";
import { getMemberCustomFieldAnswerRows } from "@/server/queries/member-custom-fields";

const liveForm = (orgId: string) => and(eq(forms.orgId, orgId), isNull(forms.deletedAt));

const ownerName = sql<string | null>`coalesce(${groups.name}, ${groupCategories.name})`;

// ─── Rows ───────────────────────────────────────────────────────────────────

export async function getFormById(orgId: string, formId: string) {
  const [row] = await db
    .select()
    .from(forms)
    .where(and(liveForm(orgId), eq(forms.id, formId)))
    .limit(1);
  return row ?? null;
}

/** The linked event, live or not: a form on a deleted event is closed, not orphaned. */
export async function getFormEvent(orgId: string, form: Pick<Form, "eventId">) {
  if (!form.eventId) return null;
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.orgId, orgId), eq(events.id, form.eventId)))
    .limit(1);
  return row ?? null;
}

export async function listFormQuestions(orgId: string, formId: string) {
  return db
    .select()
    .from(formQuestions)
    .where(and(eq(formQuestions.orgId, orgId), eq(formQuestions.formId, formId)))
    .orderBy(asc(formQuestions.sortOrder), asc(formQuestions.createdAt));
}

/** The live custom field behind every linked question, in one query. */
export async function loadLiveFields(
  orgId: string,
  questions: readonly Pick<FormQuestion, "memberFieldId">[],
): Promise<Map<string, MemberCustomField>> {
  const ids = [...new Set(questions.map((q) => q.memberFieldId).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select()
    .from(memberCustomFields)
    .where(and(eq(memberCustomFields.orgId, orgId), inArray(memberCustomFields.id, ids)));
  return new Map(rows.map((row) => [row.id, row]));
}

export async function listFormAudience(orgId: string, formId: string) {
  return db
    .select({
      rule: formAudience,
      groupName: groups.name,
      categoryName: groupCategories.name,
      memberFirstName: tenantMembers.firstName,
      memberLastName: tenantMembers.lastName,
    })
    .from(formAudience)
    .leftJoin(groups, eq(groups.id, formAudience.groupId))
    .leftJoin(groupCategories, eq(groupCategories.id, formAudience.categoryId))
    .leftJoin(tenantMembers, eq(tenantMembers.id, formAudience.memberId))
    .where(and(eq(formAudience.orgId, orgId), eq(formAudience.formId, formId)))
    .orderBy(asc(formAudience.createdAt));
}

// ─── Eligibility ────────────────────────────────────────────────────────────

/**
 * Members who may fill the form in the portal.
 *
 * Linked: whoever may see the event (targeted → its audience, else every
 * active member). Unlinked: every active member, or the form's own audience.
 * Templates and drafts are not reachable and return nobody.
 */
export async function listFormEligibleMemberIds(
  orgId: string,
  form: Pick<Form, "id" | "eventId" | "visibility" | "isTemplate">,
  event: Pick<Event, "id" | "visibility"> | null,
): Promise<Set<string>> {
  if (form.isTemplate) return new Set();

  if (form.eventId) {
    if (!event) return new Set();
    if (event.visibility === "targeted") return listEligibleMemberIds(orgId, event.id);
    return (await loadAudienceSnapshot(orgId)).activeMemberIds;
  }

  if (form.visibility === "org") return (await loadAudienceSnapshot(orgId)).activeMemberIds;

  const [snapshot, rules] = await Promise.all([
    loadAudienceSnapshot(orgId),
    db
      .select({
        kind: formAudience.kind,
        groupId: formAudience.groupId,
        categoryId: formAudience.categoryId,
        memberId: formAudience.memberId,
        scope: formAudience.scope,
      })
      .from(formAudience)
      .where(and(eq(formAudience.orgId, orgId), eq(formAudience.formId, form.id))),
  ]);

  return resolveEligibleMemberIds({ ...snapshot, rules });
}

export async function getMemberRsvpAnswer(
  orgId: string,
  eventId: string | null,
  memberId: string,
): Promise<EventRsvpAnswer | null> {
  if (!eventId) return null;
  const [row] = await db
    .select({ answer: eventResponses.answer })
    .from(eventResponses)
    .where(
      and(
        eq(eventResponses.orgId, orgId),
        eq(eventResponses.eventId, eventId),
        eq(eventResponses.memberId, memberId),
      ),
    )
    .limit(1);
  return row?.answer ?? null;
}

export async function getGuestRsvpAnswer(
  orgId: string,
  eventId: string,
  email: string,
): Promise<EventRsvpAnswer | null> {
  const [row] = await db
    .select({ answer: eventResponses.answer })
    .from(eventResponses)
    .where(
      and(
        eq(eventResponses.orgId, orgId),
        eq(eventResponses.eventId, eventId),
        sql`lower(${eventResponses.guestEmail}) = lower(${email})`,
      ),
    )
    .limit(1);
  return row?.answer ?? null;
}

/** Everything `persistSubmission` needs to know about a member: one call. */
export async function buildMemberIdentity(
  orgId: string,
  form: Pick<Form, "id" | "eventId" | "visibility" | "isTemplate">,
  event: Pick<Event, "id" | "visibility"> | null,
  memberId: string,
): Promise<Extract<SubmissionIdentity, { kind: "member" }>> {
  const [eligibleIds, rsvpAnswer] = await Promise.all([
    listFormEligibleMemberIds(orgId, form, event),
    getMemberRsvpAnswer(orgId, form.eventId, memberId),
  ]);
  return { kind: "member", memberId, eligible: eligibleIds.has(memberId), rsvpAnswer };
}

// ─── Submissions ────────────────────────────────────────────────────────────

const submissionIdentityWhere = (formId: string, identity: SubmissionIdentity) => {
  const memberId = identity.kind === "guest" ? null : identity.memberId;
  const guestEmail = identity.kind === "member" ? null : identity.guestEmail;
  if (memberId) return and(eq(formSubmissions.formId, formId), eq(formSubmissions.memberId, memberId));
  if (guestEmail) {
    return and(
      eq(formSubmissions.formId, formId),
      sql`lower(${formSubmissions.guestEmail}) = lower(${guestEmail})`,
    );
  }
  return null;
};

/** The identity's own submission with answers opened for them, or null. */
export async function getIdentitySubmission(
  orgId: string,
  formId: string,
  identity: SubmissionIdentity,
) {
  const where = submissionIdentityWhere(formId, identity);
  if (!where) return null;

  const [submission] = await db
    .select()
    .from(formSubmissions)
    .where(and(eq(formSubmissions.orgId, orgId), where))
    .limit(1);
  if (!submission) return null;

  const rows = await db
    .select()
    .from(formAnswers)
    .where(eq(formAnswers.submissionId, submission.id));

  return { submission, answerRows: new Map(rows.map((row) => [row.questionId, row])) };
}

// ─── Filler ─────────────────────────────────────────────────────────────────

export type FillerQuestion = Omit<FormQuestion, "type" | "options" | "constraints"> & {
  type: NonNullable<FormQuestion["type"]> | null;
  options: string[];
  constraints: FormQuestion["constraints"];
  /** True when the question is linked and the live field still exists. */
  linked: boolean;
};

/**
 * Everything the filler renders: questions with the live field's shape
 * substituted, the identity's existing answers (their own, so never
 * withheld), and profile values to pre-fill linked questions that have no
 * answer yet (members only).
 */
export async function getFormForFiller(
  orgId: string,
  form: Form,
  event: Event | null,
  identity: SubmissionIdentity,
) {
  const questions = await listFormQuestions(orgId, form.id);
  const liveFields = await loadLiveFields(orgId, questions);

  const fillerQuestions: FillerQuestion[] = questions.map((question) => {
    const shape = resolveQuestionShape(question, liveFields);
    return {
      ...question,
      type: shape?.type ?? null,
      options: shape?.options ?? question.options,
      constraints: shape?.constraints ?? question.constraints,
      linked: !!question.memberFieldId && liveFields.has(question.memberFieldId),
    };
  });

  const existing = await getIdentitySubmission(orgId, form.id, identity);

  const answers: Record<string, CustomFieldValue> = {};
  if (existing) {
    for (const question of questions) {
      if (question.kind !== "input") continue;
      const result = readAnswer(question, existing.answerRows.get(question.id), "self");
      answers[question.id] = result.kind === "value" ? result.value : null;
    }
  }

  const prefill: Record<string, CustomFieldValue> = {};
  if (!existing && identity.kind === "member") {
    const rows = await getMemberCustomFieldAnswerRows(orgId, identity.memberId);
    const byFieldId = new Map(rows.map((row) => [row.fieldId, row.value]));
    for (const question of fillerQuestions) {
      if (!question.linked) continue;
      const value = byFieldId.get(question.memberFieldId!);
      if (value !== undefined && value !== null) prefill[question.id] = value;
    }
  }

  const now = new Date();
  return {
    form,
    event,
    questions: fillerQuestions,
    open: isFormOpen(form, event, now),
    canSubmit: canSubmit({ form, event, viewer: viewerOf(identity), now }),
    submission: existing?.submission ?? null,
    answers,
    prefill,
  };
}

// ─── Per-event lists ────────────────────────────────────────────────────────

export type EventFormItem = {
  form: Form;
  placement: FormPlacement;
  open: FormOpenResult;
  canSubmit: boolean;
  pending: boolean;
  submittedAt: Date | null;
};

/**
 * The event's non-template forms as one viewer sees them. Managers get every
 * status (pass `viewer: null` and filter in the panel); everyone else gets
 * only open forms.
 */
export async function listFormsForEvent(
  orgId: string,
  event: Event,
  viewer: SubmissionIdentity | null,
): Promise<EventFormItem[]> {
  const rows = await db
    .select()
    .from(forms)
    .where(and(liveForm(orgId), eq(forms.eventId, event.id)))
    .orderBy(asc(forms.createdAt));

  const now = new Date();
  const items: EventFormItem[] = [];
  for (const form of rows) {
    const open = isFormOpen(form, event, now);
    if (!viewer) {
      items.push({
        form,
        placement: getFormPlacement(form, event, now),
        open,
        canSubmit: false,
        pending: false,
        submittedAt: null,
      });
      continue;
    }
    if (!open.open) continue;
    const existing = await getIdentitySubmission(orgId, form.id, viewer);
    const submittable = canSubmit({ form, event, viewer: viewerOf(viewer), now });
    items.push({
      form,
      placement: getFormPlacement(form, event, now),
      open,
      canSubmit: submittable.ok,
      pending: isPending({ form, event, viewer: viewerOf(viewer), hasSubmission: !!existing, now }),
      submittedAt: existing?.submission.submittedAt ?? null,
    });
  }
  return items;
}

/** The event detail's Forms tab: every status, with submission and pending counts. */
export async function listEventFormsForManager(orgId: string, event: Event) {
  const items = await listFormsForEvent(orgId, event, null);
  if (items.length === 0) return [];

  const counts = await db
    .select({ formId: formSubmissions.formId, count: sql<number>`count(*)::int` })
    .from(formSubmissions)
    .where(
      and(
        eq(formSubmissions.orgId, orgId),
        inArray(formSubmissions.formId, items.map((item) => item.form.id)),
      ),
    )
    .groupBy(formSubmissions.formId);
  const countByForm = new Map(counts.map((row) => [row.formId, row.count]));

  const out: Array<EventFormItem & { submissionCount: number; pendingCount: number }> = [];
  for (const item of items) {
    out.push({
      ...item,
      submissionCount: countByForm.get(item.form.id) ?? 0,
      pendingCount:
        item.form.required && item.form.status === "open" ? (await listFormPending(orgId, item.form.id)).length : 0,
    });
  }
  return out;
}

// ─── Portal list ────────────────────────────────────────────────────────────

export type ViewerFormItem = EventFormItem & { event: Event | null };

/**
 * Portal buckets. Every open non-template form the member may fill, split by
 * whether they have submitted. Drafts and closed forms are not shown; a
 * closed form they answered stays under "submitted" so their copy is
 * reachable.
 */
export async function listFormsForViewer(params: { orgId: string; memberId: string }) {
  const { orgId, memberId } = params;
  const now = new Date();

  const rows = await db
    .select({ form: forms, event: events })
    .from(forms)
    .leftJoin(events, eq(events.id, forms.eventId))
    .where(and(liveForm(orgId), eq(forms.isTemplate, false)))
    .orderBy(asc(forms.closesAt), asc(forms.createdAt));

  const pending: ViewerFormItem[] = [];
  const submitted: ViewerFormItem[] = [];
  for (const { form, event } of rows) {
    // A form on a draft event is unreachable because the event page is.
    if (form.eventId && (!event || event.status === "draft")) continue;

    const identity = await buildMemberIdentity(orgId, form, event, memberId);
    if (!identity.eligible) continue;

    const existing = await getIdentitySubmission(orgId, form.id, identity);
    const open = isFormOpen(form, event, now);
    if (!open.open && !existing) continue;

    const viewer = viewerOf(identity);
    const item: ViewerFormItem = {
      form,
      event,
      placement: getFormPlacement(form, event, now),
      open,
      canSubmit: canSubmit({ form, event, viewer, now }).ok,
      pending: isPending({ form, event, viewer, hasSubmission: !!existing, now }),
      submittedAt: existing?.submission.submittedAt ?? null,
    };
    (existing ? submitted : pending).push(item);
  }

  return {
    pending: pending.filter((item) => item.canSubmit),
    submitted,
  };
}

// ─── Manager list and editor ────────────────────────────────────────────────

export type FormListItem = {
  form: Form;
  ownerName: string | null;
  eventTitle: string | null;
  submissionCount: number;
  pendingCount: number;
};

/** Admin tables. Templates are org-wide; forms are limited to manageable owners. */
export async function listFormsForManager(viewer: Viewer, options: { templates: boolean }) {
  const context = await requireGroupAdminModuleAccess(viewer);
  const owners = await listManageableOwners(viewer);
  const orgId = context.organization.id;

  const ownerClauses = options.templates
    ? [sql`true`]
    : [
        owners.organization ? eq(forms.ownerType, "organization") : null,
        owners.categoryIds.length > 0 ? inArray(forms.ownerCategoryId, owners.categoryIds) : null,
        owners.groupIds.length > 0 ? inArray(forms.ownerGroupId, owners.groupIds) : null,
      ].filter((clause): clause is NonNullable<typeof clause> => clause != null);

  if (ownerClauses.length === 0) {
    return { context, owners, items: [] as FormListItem[] };
  }

  const rows = await db
    .select({ form: forms, ownerName, eventTitle: events.title })
    .from(forms)
    .leftJoin(groups, eq(groups.id, forms.ownerGroupId))
    .leftJoin(groupCategories, eq(groupCategories.id, forms.ownerCategoryId))
    .leftJoin(events, eq(events.id, forms.eventId))
    .where(and(liveForm(orgId), eq(forms.isTemplate, options.templates), or(...ownerClauses)))
    .orderBy(desc(forms.createdAt));

  if (rows.length === 0) return { context, owners, items: [] as FormListItem[] };

  const counts = await db
    .select({ formId: formSubmissions.formId, count: sql<number>`count(*)::int` })
    .from(formSubmissions)
    .where(
      and(
        eq(formSubmissions.orgId, orgId),
        inArray(formSubmissions.formId, rows.map((row) => row.form.id)),
      ),
    )
    .groupBy(formSubmissions.formId);
  const countByForm = new Map(counts.map((row) => [row.formId, row.count]));

  const items: FormListItem[] = [];
  for (const row of rows) {
    const pendingCount =
      row.form.required && row.form.status === "open" && !row.form.isTemplate
        ? (await listFormPending(orgId, row.form.id)).length
        : 0;
    items.push({
      form: row.form,
      ownerName: row.ownerName,
      eventTitle: row.eventTitle,
      submissionCount: countByForm.get(row.form.id) ?? 0,
      pendingCount,
    });
  }

  return { context, owners, items };
}

export type EditorQuestion = FormQuestion & { liveField: MemberCustomField | null };

/** Settings, questions with their live field, audience rules. Guard first. */
export async function getFormForEditor(orgId: string, form: Form) {
  const [questions, audience, event] = await Promise.all([
    listFormQuestions(orgId, form.id),
    listFormAudience(orgId, form.id),
    getFormEvent(orgId, form),
  ]);
  const liveFields = await loadLiveFields(orgId, questions);

  return {
    form,
    event,
    questions: questions.map<EditorQuestion>((question) => ({
      ...question,
      liveField: question.memberFieldId ? liveFields.get(question.memberFieldId) ?? null : null,
    })),
    audience,
  };
}

// ─── Submissions table ──────────────────────────────────────────────────────

export type SubmissionRow = {
  submission: FormSubmission;
  member: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
  /** questionId → what this viewer may see. */
  cells: Record<string, ReadAnswerResult>;
};

/**
 * Rows with each cell already passed through `readAnswer` for the viewer.
 * `viewerAccess` is the manager's rung (`full` for org admins and leaders,
 * `scoped` for group / category admins); the submitter's own copy goes
 * through `getFormForFiller` instead.
 */
export async function listFormSubmissions(
  orgId: string,
  formId: string,
  viewerAccess: FieldViewerAccess,
): Promise<{ questions: FormQuestion[]; rows: SubmissionRow[] }> {
  const questions = await listFormQuestions(orgId, formId);
  const inputs = questions.filter((q) => q.kind === "input");

  const submissions = await db
    .select({
      submission: formSubmissions,
      member: {
        id: tenantMembers.id,
        firstName: tenantMembers.firstName,
        lastName: tenantMembers.lastName,
        email: tenantMembers.email,
      },
    })
    .from(formSubmissions)
    .leftJoin(tenantMembers, eq(tenantMembers.id, formSubmissions.memberId))
    .where(and(eq(formSubmissions.orgId, orgId), eq(formSubmissions.formId, formId)))
    .orderBy(asc(formSubmissions.submittedAt));

  if (submissions.length === 0) return { questions, rows: [] };

  const answers = await db
    .select()
    .from(formAnswers)
    .where(
      and(
        eq(formAnswers.orgId, orgId),
        inArray(formAnswers.submissionId, submissions.map((row) => row.submission.id)),
      ),
    );
  const bySubmission = new Map<string, Map<string, FormAnswer>>();
  for (const row of answers) {
    const map = bySubmission.get(row.submissionId) ?? new Map();
    map.set(row.questionId, row);
    bySubmission.set(row.submissionId, map);
  }

  const rows = submissions.map<SubmissionRow>((row) => {
    const own = bySubmission.get(row.submission.id);
    const cells: Record<string, ReadAnswerResult> = {};
    for (const question of inputs) {
      cells[question.id] = readAnswer(question, own?.get(question.id), viewerAccess);
    }
    return {
      submission: row.submission,
      member: row.member?.id ? row.member : null,
      cells,
    };
  });

  return { questions, rows };
}

// ─── Aggregates ─────────────────────────────────────────────────────────────

export type QuestionAggregate = {
  questionId: string;
  counts: Array<{ value: string; count: number }>;
  answered: number;
};

/**
 * Option counts for select / multi_select / boolean inputs. Special-category
 * questions are excluded in the WHERE, so their envelopes never even leave
 * the database for this.
 */
export async function getFormAggregates(orgId: string, formId: string) {
  const [submissionCount] = await db
    .select({ count: sql<number>`count(*)::int`, shredded: sql<number>`count(${formSubmissions.shreddedAt})::int` })
    .from(formSubmissions)
    .where(and(eq(formSubmissions.orgId, orgId), eq(formSubmissions.formId, formId)));

  const scalar = await db
    .select({
      questionId: formAnswers.questionId,
      value: sql<string>`${formAnswers.value}::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(formAnswers)
    .innerJoin(formQuestions, eq(formQuestions.id, formAnswers.questionId))
    .where(
      and(
        eq(formAnswers.orgId, orgId),
        eq(formQuestions.formId, formId),
        eq(formQuestions.sensitivity, "normal"),
        inArray(formQuestions.type, ["select", "boolean"]),
        sql`${formAnswers.value} IS NOT NULL`,
      ),
    )
    .groupBy(formAnswers.questionId, sql`${formAnswers.value}::text`);

  const multi = await db
    .select({
      questionId: formAnswers.questionId,
      value: sql<string>`option.value`,
      count: sql<number>`count(*)::int`,
    })
    .from(formAnswers)
    .innerJoin(formQuestions, eq(formQuestions.id, formAnswers.questionId))
    .innerJoin(sql`jsonb_array_elements_text(${formAnswers.value}) AS option(value)`, sql`true`)
    .where(
      and(
        eq(formAnswers.orgId, orgId),
        eq(formQuestions.formId, formId),
        eq(formQuestions.sensitivity, "normal"),
        eq(formQuestions.type, "multi_select"),
        sql`jsonb_typeof(${formAnswers.value}) = 'array'`,
      ),
    )
    .groupBy(formAnswers.questionId, sql`option.value`);

  const answered = await db
    .select({ questionId: formAnswers.questionId, count: sql<number>`count(*)::int` })
    .from(formAnswers)
    .innerJoin(formQuestions, eq(formQuestions.id, formAnswers.questionId))
    .where(
      and(
        eq(formAnswers.orgId, orgId),
        eq(formQuestions.formId, formId),
        eq(formQuestions.sensitivity, "normal"),
        sql`${formAnswers.value} IS NOT NULL`,
      ),
    )
    .groupBy(formAnswers.questionId);

  const byQuestion = new Map<string, QuestionAggregate>();
  const bucket = (questionId: string) => {
    const existing = byQuestion.get(questionId);
    if (existing) return existing;
    const created = { questionId, counts: [], answered: 0 };
    byQuestion.set(questionId, created);
    return created;
  };

  for (const row of scalar) {
    // `::text` of a jsonb string keeps its quotes; strip them for display.
    const value = row.value.startsWith('"') ? (JSON.parse(row.value) as string) : row.value;
    bucket(row.questionId).counts.push({ value, count: row.count });
  }
  for (const row of multi) bucket(row.questionId).counts.push({ value: row.value, count: row.count });
  for (const row of answered) bucket(row.questionId).answered = row.count;

  return {
    submissionCount: submissionCount?.count ?? 0,
    shreddedCount: submissionCount?.shredded ?? 0,
    questions: [...byQuestion.values()],
  };
}

// ─── Pending ────────────────────────────────────────────────────────────────

export type PendingIdentity = {
  email: string | null;
  name: string | null;
  memberId: string | null;
  /** Externals and guests reach the form only through their event token. */
  externalEmail: string | null;
};

/**
 * Everyone eligible who has not submitted. Backs both the pending list and
 * the reminder recipients, so the count the manager approves is the count
 * that gets mailed. Members without a usable address stay in the list (the
 * pending panel shows them) and are skipped by the sender.
 */
export async function listFormPending(orgId: string, formId: string): Promise<PendingIdentity[]> {
  const form = await getFormById(orgId, formId);
  if (!form || form.isTemplate) return [];
  const event = await getFormEvent(orgId, form);
  if (form.eventId && !event) return [];

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!organization) return [];

  const submitted = await db
    .select({ memberId: formSubmissions.memberId, guestEmail: formSubmissions.guestEmail })
    .from(formSubmissions)
    .where(and(eq(formSubmissions.orgId, orgId), eq(formSubmissions.formId, formId)));
  const submittedMembers = new Set(submitted.map((r) => r.memberId).filter((id): id is string => !!id));
  const submittedEmails = new Set(
    submitted.map((r) => r.guestEmail?.toLowerCase()).filter((e): e is string => !!e),
  );

  const rsvpByMember = new Map<string, EventRsvpAnswer>();
  const rsvpByEmail = new Map<string, { answer: EventRsvpAnswer; name: string | null }>();
  if (event) {
    const responses = await db
      .select({
        memberId: eventResponses.memberId,
        guestEmail: eventResponses.guestEmail,
        guestName: eventResponses.guestName,
        answer: eventResponses.answer,
      })
      .from(eventResponses)
      .where(and(eq(eventResponses.orgId, orgId), eq(eventResponses.eventId, event.id)));
    for (const row of responses) {
      if (row.memberId) rsvpByMember.set(row.memberId, row.answer);
      else if (row.guestEmail) {
        rsvpByEmail.set(row.guestEmail.toLowerCase(), { answer: row.answer, name: row.guestName });
      }
    }
  }

  const out: PendingIdentity[] = [];
  const seenEmails = new Set<string>();

  const memberIds = [...(await listFormEligibleMemberIds(orgId, form, event))];
  if (memberIds.length > 0) {
    const members = await db
      .select({
        id: tenantMembers.id,
        firstName: tenantMembers.firstName,
        lastName: tenantMembers.lastName,
        email: tenantMembers.email,
        workspaceUserEmail: tenantMembers.workspaceUserEmail,
        preferredEmail: tenantMembers.preferredEmail,
      })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.orgId, orgId), inArray(tenantMembers.id, memberIds)))
      .orderBy(asc(tenantMembers.lastName), asc(tenantMembers.firstName));

    for (const member of members) {
      if (submittedMembers.has(member.id)) continue;
      if (form.onlyRsvpYes && rsvpByMember.get(member.id) !== "yes") continue;
      const email = resolveMemberEmailForOrg({ member, organization });
      if (email) seenEmails.add(email.toLowerCase());
      out.push({
        email,
        name: `${member.firstName} ${member.lastName}`.trim() || null,
        memberId: member.id,
        externalEmail: null,
      });
    }
  }

  if (event) {
    const externals = await db
      .select({ email: eventAudience.externalEmail, name: eventAudience.externalName })
      .from(eventAudience)
      .where(
        and(
          eq(eventAudience.orgId, orgId),
          eq(eventAudience.eventId, event.id),
          eq(eventAudience.kind, "external"),
        ),
      );

    const candidates: Array<{ email: string; name: string | null }> = externals
      .filter((row): row is { email: string; name: string | null } => !!row.email)
      .map((row) => ({ email: row.email.toLowerCase(), name: row.name }));
    for (const [email, rsvp] of rsvpByEmail) candidates.push({ email, name: rsvp.name });

    for (const candidate of candidates) {
      if (seenEmails.has(candidate.email) || submittedEmails.has(candidate.email)) continue;
      if (form.onlyRsvpYes && rsvpByEmail.get(candidate.email)?.answer !== "yes") continue;
      seenEmails.add(candidate.email);
      out.push({
        email: candidate.email,
        name: candidate.name,
        memberId: null,
        externalEmail: candidate.email,
      });
    }
  }

  return out;
}

// ─── Export ─────────────────────────────────────────────────────────────────

function csvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * One row per submission, one column per input question. Withheld cells say
 * so; a blank means no answer. Special-category columns are included only
 * when `includeSensitive` — the toggle in the table is mirrored here so the
 * file matches what the manager was looking at.
 */
export async function exportFormSubmissionsCsv(
  orgId: string,
  formId: string,
  viewerAccess: FieldViewerAccess,
  options: { includeSensitive: boolean },
) {
  const { questions, rows } = await listFormSubmissions(orgId, formId, viewerAccess);
  const columns = questions.filter(
    (q) => q.kind === "input" && (options.includeSensitive || q.sensitivity === "normal"),
  );

  const header = ["Name", "Email", "Submitted at", ...columns.map((q) => q.label)];
  const lines = [header.map(csvCell).join(",")];

  for (const row of rows) {
    const name = row.member
      ? `${row.member.firstName} ${row.member.lastName}`.trim()
      : row.submission.guestName ?? "";
    const email = row.member ? row.member.email ?? "" : row.submission.guestEmail ?? "";
    const cells = columns.map((q) => {
      const cell = row.cells[q.id];
      if (!cell || cell.kind === "empty") return "";
      if (cell.kind === "withheld") return "[withheld]";
      return Array.isArray(cell.value) ? cell.value.join("; ") : String(cell.value);
    });
    lines.push(
      [name, email, row.submission.submittedAt.toISOString(), ...cells].map(csvCell).join(","),
    );
  }

  return lines.join("\r\n");
}
