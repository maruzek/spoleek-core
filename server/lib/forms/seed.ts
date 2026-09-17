import { and, eq, like } from "drizzle-orm";

import { db } from "@/server/db";
import { formQuestions, forms, memberCustomFields, tenantMembers } from "@/server/db/schema";
import { persistSubmission } from "@/server/lib/forms/submissions";
import { loadLiveFields } from "@/server/queries/forms";

/** Every fixture form carries this title prefix so a reset removes exactly them. */
export const DEMO_FORM_TITLE_PREFIX = "Demo · ";

/**
 * One template and one required form linked to the given event, with a
 * linked question (the org's first active member-facing text/phone field,
 * when there is one), a special-category question, and a couple of
 * submissions from the first active members. Without an event the linked
 * form is created standalone.
 */
export async function seedDemoForms(orgId: string, options: { eventId?: string | null } = {}) {
  const [field] = await db
    .select()
    .from(memberCustomFields)
    .where(
      and(
        eq(memberCustomFields.orgId, orgId),
        eq(memberCustomFields.isActive, true),
        eq(memberCustomFields.sensitivity, "normal"),
      ),
    )
    .limit(5)
    .then((rows) => rows.filter((row) => row.stage !== "admin_only" && (row.type === "phone" || row.type === "text")));

  const [template] = await db
    .insert(forms)
    .values({
      orgId,
      title: `${DEMO_FORM_TITLE_PREFIX}Event evaluation`,
      description: "How did it go? Two minutes, anonymous enough.",
      isTemplate: true,
      ownerType: "organization",
      timing: "after_event",
      status: "draft",
    })
    .returning({ id: forms.id });

  await db.insert(formQuestions).values([
    {
      orgId,
      formId: template!.id,
      sortOrder: 0,
      kind: "input",
      label: "Overall, how was it?",
      type: "select",
      options: ["Great", "Fine", "Meh", "Not for me"],
      required: true,
    },
    {
      orgId,
      formId: template!.id,
      sortOrder: 1,
      kind: "input",
      label: "Anything we should change?",
      type: "textarea",
      constraints: { maxLength: 1000 },
    },
  ]);

  const [registration] = await db
    .insert(forms)
    .values({
      orgId,
      title: `${DEMO_FORM_TITLE_PREFIX}Camp registration`,
      description: "We need these details for the kitchen and the first-aider.",
      ownerType: "organization",
      eventId: options.eventId ?? null,
      timing: options.eventId ? "after_rsvp" : "anytime",
      required: true,
      onlyRsvpYes: Boolean(options.eventId),
      status: "open",
      visibility: "org",
    })
    .returning({ id: forms.id });

  const questions = await db
    .insert(formQuestions)
    .values([
      {
        orgId,
        formId: registration!.id,
        sortOrder: 0,
        kind: "section",
        label: "Contact",
        descriptionHtml: "<p>So we can reach you during the camp.</p>",
      },
      {
        orgId,
        formId: registration!.id,
        sortOrder: 1,
        kind: "input",
        label: field ? field.label : "Phone number",
        type: field?.type ?? "phone",
        options: field?.options ?? [],
        constraints: field?.constraints ?? {},
        required: true,
        memberFieldId: field?.id ?? null,
        profileSync: field ? "offer_checked" : "none",
      },
      {
        orgId,
        formId: registration!.id,
        sortOrder: 2,
        kind: "input",
        label: "T-shirt size",
        type: "select",
        options: ["S", "M", "L", "XL"],
        required: true,
      },
      {
        orgId,
        formId: registration!.id,
        sortOrder: 3,
        kind: "section",
        label: "Health",
        descriptionHtml: "<p>Only the first-aider and org admins can read these answers. They are deleted 30 days after the camp.</p>",
      },
      {
        orgId,
        formId: registration!.id,
        sortOrder: 4,
        kind: "input",
        label: "Allergies, diet or medication we should know about",
        type: "textarea",
        sensitivity: "special_category",
        art9Condition: "health_care",
        processingPurpose: "Allergies and medication for the camp kitchen and the first-aider.",
        valueVisibility: "org_admins",
        shredAfterEventDays: 30,
      },
    ])
    .returning();

  const members = await db
    .select({ id: tenantMembers.id })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.orgId, orgId), eq(tenantMembers.status, "active")))
    .limit(2);

  const [form] = await db.select().from(forms).where(eq(forms.id, registration!.id)).limit(1);
  const liveFieldsById = await loadLiveFields(orgId, questions);
  const byLabel = new Map(questions.map((q) => [q.label, q.id]));
  const samples = [
    { phone: "+420 777 123 456", size: "M", diet: "Peanut allergy — carries an EpiPen." },
    { phone: "+420 608 987 654", size: "L", diet: "" },
  ];

  let submissions = 0;
  for (const [index, member] of members.entries()) {
    const sample = samples[index]!;
    await db.transaction((tx) =>
      persistSubmission(tx, {
        form: form!,
        event: null,
        questions,
        liveFieldsById,
        identity: { kind: "member", memberId: member.id, eligible: true, rsvpAnswer: "yes" },
        answers: {
          [byLabel.get(field ? field.label : "Phone number")!]: sample.phone,
          [byLabel.get("T-shirt size")!]: sample.size,
          [byLabel.get("Allergies, diet or medication we should know about")!]: sample.diet,
        },
        submittedByUserId: null,
        skipRules: true,
      }),
    );
    submissions += 1;
  }

  return { templateId: template!.id, formId: registration!.id, submissions };
}

export async function resetDemoForms(orgId: string) {
  const removed = await db
    .delete(forms)
    .where(and(eq(forms.orgId, orgId), like(forms.title, `${DEMO_FORM_TITLE_PREFIX}%`)))
    .returning({ title: forms.title });

  return removed.map((row) => row.title);
}
