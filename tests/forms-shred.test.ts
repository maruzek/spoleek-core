import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/server/db";
import {
  events,
  formAnswers,
  formQuestions,
  formSubmissions,
  forms,
  memberCustomFieldValues,
  memberCustomFields,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import { readAnswer } from "@/server/lib/forms/answers";
import { shredFormAnswers } from "@/server/lib/forms/retention";
import { persistSubmission } from "@/server/lib/forms/submissions";
import { getFormAggregates, listFormSubmissions, loadLiveFields } from "@/server/queries/forms";

/**
 * The submit → read → shred cycle against a real database: the CHECKs, the
 * envelope and the anchor arithmetic in SQL are the things a unit test with
 * fakes cannot prove. Creates its own organization and deletes it afterwards
 * (everything cascades from `org_id`).
 */
const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

const DAY = 24 * 60 * 60 * 1000;

suite("forms: submit, read and shred", () => {
  let orgId: string;
  let memberId: string;
  let phoneFieldId: string;
  let eventId: string;
  let formId: string;
  let dietQuestionId: string;
  let phoneQuestionId: string;
  let sizeQuestionId: string;
  let noteQuestionId: string;

  beforeAll(async () => {
    const suffix = Date.now();
    const [org] = await db
      .insert(organizations)
      .values({ name: "Forms Test Org", slug: `forms-test-${suffix}` })
      .returning({ id: organizations.id });
    orgId = org.id;

    const [member] = await db
      .insert(tenantMembers)
      .values({
        orgId,
        firstName: "Form",
        lastName: "Filler",
        email: `filler-${suffix}@example.test`,
        status: "active",
      })
      .returning({ id: tenantMembers.id });
    memberId = member.id;

    const [phoneField] = await db
      .insert(memberCustomFields)
      .values({ orgId, key: "phone", label: "Phone", type: "phone", stage: "optional" })
      .returning({ id: memberCustomFields.id });
    phoneFieldId = phoneField.id;

    // The event ended 20 days ago.
    const [event] = await db
      .insert(events)
      .values({
        orgId,
        slug: `camp-${suffix}`,
        title: "Camp",
        ownerType: "organization",
        status: "published",
        visibility: "org",
        startsAt: new Date(Date.now() - 25 * DAY),
        endsAt: new Date(Date.now() - 20 * DAY),
      })
      .returning({ id: events.id });
    eventId = event.id;

    const [form] = await db
      .insert(forms)
      .values({
        orgId,
        title: "Camp registration",
        ownerType: "organization",
        eventId,
        status: "open",
        required: true,
      })
      .returning({ id: forms.id });
    formId = form.id;

    const inserted = await db
      .insert(formQuestions)
      .values([
        {
          orgId,
          formId,
          sortOrder: 0,
          kind: "input",
          label: "Diet",
          type: "textarea",
          sensitivity: "special_category",
          art9Condition: "health_care",
          processingPurpose: "Allergies for the camp kitchen.",
          valueVisibility: "org_admins",
          shredAfterEventDays: 10, // due
        },
        {
          orgId,
          formId,
          sortOrder: 1,
          kind: "input",
          label: "Phone",
          type: "phone",
          memberFieldId: phoneFieldId,
          profileSync: "offer",
          shredAfterEventDays: 30, // not yet due
        },
        {
          orgId,
          formId,
          sortOrder: 2,
          kind: "input",
          label: "Shirt",
          type: "select",
          options: ["S", "M", "L"],
        },
        {
          orgId,
          formId,
          sortOrder: 3,
          kind: "input",
          label: "Note",
          type: "text",
          required: false,
        },
      ])
      .returning({ id: formQuestions.id, label: formQuestions.label });
    dietQuestionId = inserted.find((q) => q.label === "Diet")!.id;
    phoneQuestionId = inserted.find((q) => q.label === "Phone")!.id;
    sizeQuestionId = inserted.find((q) => q.label === "Shirt")!.id;
    noteQuestionId = inserted.find((q) => q.label === "Note")!.id;
  });

  afterAll(async () => {
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
    await pool.end();
  });

  it("persists a submission, seals the sensitive answer and syncs the profile", async () => {
    const questions = await db.select().from(formQuestions).where(eq(formQuestions.formId, formId));
    const liveFieldsById = await loadLiveFields(orgId, questions);
    const form = (await db.select().from(forms).where(eq(forms.id, formId)))[0]!;
    const event = (await db.select().from(events).where(eq(events.id, eventId)))[0]!;

    const result = await db.transaction((tx) =>
      persistSubmission(tx, {
        form,
        event,
        questions,
        liveFieldsById,
        identity: { kind: "member", memberId, eligible: true, rsvpAnswer: "yes" },
        answers: {
          [dietQuestionId]: "peanuts",
          [phoneQuestionId]: "+420 777 000 000",
          [sizeQuestionId]: "M",
          [noteQuestionId]: "",
        },
        syncFlags: { [phoneQuestionId]: true },
        submittedByUserId: null,
      }),
    );
    expect(result.profileWrites).toBe(1);

    const rows = await db.select().from(formAnswers).where(eq(formAnswers.submissionId, result.submissionId));
    const byQuestion = new Map(rows.map((row) => [row.questionId, row]));

    // Sealed: nothing in `value`, envelope in `encryptedValue`.
    expect(byQuestion.get(dietQuestionId)!.value).toBeNull();
    expect(byQuestion.get(dietQuestionId)!.encryptedValue).not.toContain("peanuts");
    expect(byQuestion.get(sizeQuestionId)!.value).toBe("M");
    // Blank answers are not stored.
    expect(byQuestion.has(noteQuestionId)).toBe(false);

    const [profile] = await db
      .select({ value: memberCustomFieldValues.value })
      .from(memberCustomFieldValues)
      .where(eq(memberCustomFieldValues.memberId, memberId));
    expect(profile?.value).toBe("+420 777 000 000");
  });

  it("withholds the org-admin-only answer from a scoped viewer and opens it for a full one", async () => {
    const scoped = await listFormSubmissions(orgId, formId, "scoped");
    expect(scoped.rows[0]!.cells[dietQuestionId]).toEqual({ kind: "withheld" });
    expect(scoped.rows[0]!.cells[sizeQuestionId]).toEqual({ kind: "value", value: "M" });

    const full = await listFormSubmissions(orgId, formId, "full");
    expect(full.rows[0]!.cells[dietQuestionId]).toEqual({ kind: "value", value: "peanuts" });
  });

  it("aggregates plaintext options and never the sensitive ones", async () => {
    const aggregates = await getFormAggregates(orgId, formId);
    expect(aggregates.submissionCount).toBe(1);
    expect(aggregates.questions.map((q) => q.questionId)).not.toContain(dietQuestionId);
    expect(aggregates.questions.find((q) => q.questionId === sizeQuestionId)?.counts).toEqual([
      { value: "M", count: 1 },
    ]);
  });

  it("re-submitting replaces answers rather than duplicating the row", async () => {
    const questions = await db.select().from(formQuestions).where(eq(formQuestions.formId, formId));
    const liveFieldsById = await loadLiveFields(orgId, questions);
    const form = (await db.select().from(forms).where(eq(forms.id, formId)))[0]!;
    const event = (await db.select().from(events).where(eq(events.id, eventId)))[0]!;

    await db.transaction((tx) =>
      persistSubmission(tx, {
        form,
        event,
        questions,
        liveFieldsById,
        identity: { kind: "member", memberId, eligible: true, rsvpAnswer: "yes" },
        answers: { [dietQuestionId]: "gluten", [phoneQuestionId]: "+420 777 000 001", [sizeQuestionId]: "L" },
        submittedByUserId: null,
      }),
    );

    const submissions = await db.select().from(formSubmissions).where(eq(formSubmissions.formId, formId));
    expect(submissions).toHaveLength(1);
    const full = await listFormSubmissions(orgId, formId, "full");
    expect(full.rows[0]!.cells[sizeQuestionId]).toEqual({ kind: "value", value: "L" });
    // No sync flag this time: the profile keeps the earlier value.
    const [profile] = await db
      .select({ value: memberCustomFieldValues.value })
      .from(memberCustomFieldValues)
      .where(eq(memberCustomFieldValues.memberId, memberId));
    expect(profile?.value).toBe("+420 777 000 000");
  });

  it("shreds only the answers whose TTL has passed", async () => {
    const result = await shredFormAnswers();
    expect(result.answersShredded).toBeGreaterThanOrEqual(1);

    const rows = await db
      .select()
      .from(formAnswers)
      .innerJoin(formSubmissions, eq(formSubmissions.id, formAnswers.submissionId))
      .where(eq(formSubmissions.formId, formId));
    const byQuestion = new Map(rows.map((row) => [row.form_answers.questionId, row.form_answers]));

    const diet = byQuestion.get(dietQuestionId)!;
    expect(diet.value).toBeNull();
    expect(diet.encryptedValue).toBeNull();
    expect(readAnswer({ sensitivity: "special_category", valueVisibility: "org_admins" }, diet, "full")).toEqual({
      kind: "empty",
    });

    // 30-day TTL, event ended 20 days ago: untouched.
    expect(byQuestion.get(phoneQuestionId)!.value).toBe("+420 777 000 001");
    // No TTL: untouched.
    expect(byQuestion.get(sizeQuestionId)!.value).toBe("L");

    // A live shreddable answer (phone) remains, so the submission is not yet marked.
    const [submission] = await db.select().from(formSubmissions).where(eq(formSubmissions.formId, formId));
    expect(submission!.shreddedAt).toBeNull();
  });

  it("marks the submission once every shreddable answer is gone, and is idempotent", async () => {
    await db
      .update(formQuestions)
      .set({ shredAfterEventDays: 5 })
      .where(eq(formQuestions.id, phoneQuestionId));

    const first = await shredFormAnswers();
    expect(first.answersShredded).toBe(1);
    expect(first.submissionsMarked).toBe(1);

    const second = await shredFormAnswers();
    expect(second.answersShredded).toBe(0);
    expect(second.submissionsMarked).toBe(0);

    const [submission] = await db.select().from(formSubmissions).where(eq(formSubmissions.formId, formId));
    expect(submission!.shreddedAt).not.toBeNull();
  });

  it("leaves an unanchored question alone", async () => {
    const [unlinked] = await db
      .insert(forms)
      .values({ orgId, title: "Survey", ownerType: "organization", status: "open" })
      .returning({ id: forms.id });
    const [question] = await db
      .insert(formQuestions)
      .values({
        orgId,
        formId: unlinked!.id,
        sortOrder: 0,
        kind: "input",
        label: "Anything",
        type: "text",
        shredAfterEventDays: 1,
      })
      .returning({ id: formQuestions.id });
    const [submission] = await db
      .insert(formSubmissions)
      .values({ orgId, formId: unlinked!.id, memberId })
      .returning({ id: formSubmissions.id });
    await db.insert(formAnswers).values({
      orgId,
      submissionId: submission!.id,
      questionId: question!.id,
      value: "kept",
    });

    await shredFormAnswers();

    const [row] = await db.select().from(formAnswers).where(eq(formAnswers.submissionId, submission!.id));
    expect(row!.value).toBe("kept");
  });
});
