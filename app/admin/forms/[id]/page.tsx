import type { FormAudienceRow } from "@/components/app/forms/form-audience-editor";
import { FormEditor } from "@/components/app/forms/form-editor";
import { getShredAnchor } from "@/lib/forms/rules";
import { resolveQuestionShape } from "@/lib/forms/validation";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { listManageableOwners, requireFormManagementAccess } from "@/server/queries/access";
import { requireViewer } from "@/server/queries/viewer";
import { listFormEmailActivities } from "@/server/queries/email-activity";
import { listEventsForOwnerPicker } from "@/server/queries/events";
import {
  getFormAggregates,
  getFormForEditor,
  listFormEligibleMemberIds,
  listFormPending,
  listFormSubmissions,
  type FillerQuestion,
} from "@/server/queries/forms";

export default async function AdminFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const viewer = await requireViewer();
  const { context, form } = await requireFormManagementAccess(viewer, id);
  const orgId = context.organization.id;

  const canWrite = form.isTemplate ? context.capabilities.canManageOrganization : true;
  const viewerAccess = context.adminAccessLevel === "full" ? "full" : "scoped";

  const [editor, owners, picker, submissions, aggregates, pending, sendLog] = await Promise.all([
    getFormForEditor(orgId, form),
    listManageableOwners(viewer),
    listEventsForOwnerPicker(orgId),
    listFormSubmissions(orgId, form.id, viewerAccess),
    getFormAggregates(orgId, form.id),
    listFormPending(orgId, form.id),
    listFormEmailActivities(orgId, form.id),
  ]);
  const eligibleIds = await listFormEligibleMemberIds(orgId, form, editor.event);

  const ownerName =
    form.ownerType === "group"
      ? picker.groups.find((g) => g.id === form.ownerGroupId)?.name ?? null
      : form.ownerType === "category"
        ? picker.categories.find((c) => c.id === form.ownerCategoryId)?.name ?? null
        : null;

  const liveFields = new Map(
    editor.questions.flatMap((q) => (q.liveField ? [[q.liveField.id, q.liveField] as const] : [])),
  );
  const fillerQuestions: FillerQuestion[] = editor.questions.map((q) => {
    const { liveField, ...question } = q;
    const shape = resolveQuestionShape(question, liveFields);
    return {
      ...question,
      type: shape?.type ?? null,
      options: shape?.options ?? question.options,
      constraints: shape?.constraints ?? question.constraints,
      linked: liveField != null,
    };
  });

  const audience: FormAudienceRow[] = editor.audience.map(({ rule, groupName, categoryName, memberFirstName, memberLastName }) => ({
    id: rule.id,
    kind: rule.kind,
    groupId: rule.groupId,
    categoryId: rule.categoryId,
    memberId: rule.memberId,
    scope: rule.scope,
    label:
      rule.kind === "group"
        ? (groupName ?? "Group")
        : rule.kind === "category"
          ? (categoryName ?? "Category")
          : getMemberDisplayName({ firstName: memberFirstName ?? "", lastName: memberLastName ?? "" }),
  }));

  return (
    <div className="flex flex-1 flex-col pb-8">
      <FormEditor
        form={form}
        event={editor.event}
        ownerName={ownerName}
        owners={{
          organization: owners.organization,
          categories: picker.categories.filter((c) => owners.categoryIds.includes(c.id)),
          groups: picker.groups.filter((g) => owners.groupIds.includes(g.id)),
        }}
        questions={editor.questions}
        fillerQuestions={fillerQuestions}
        audience={audience}
        eligibleCount={eligibleIds.size}
        submissions={submissions}
        aggregates={aggregates}
        pending={pending}
        sendLog={sendLog}
        viewerAccess={viewerAccess}
        canWrite={canWrite}
        hasShredAnchor={getShredAnchor(form, editor.event) != null}
        timeZone={context.organization.timezone}
        defaultStep={typeof query.step === "string" ? query.step : undefined}
      />
    </div>
  );
}
