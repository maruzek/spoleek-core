import { notFound } from "next/navigation";

import type { EnabledProvisionField } from "@/components/app/member-approve-workspace-dialog";
import { MemberDetailView } from "@/components/app/member-detail/member-detail-view";
import { getMemberDetailData } from "@/server/queries/member-detail";
import { WORKSPACE_FIELD_MAP } from "@/server/lib/workspace/field-catalog";

export default async function AdminMemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { memberId } = await params;
  const query = searchParams ? await searchParams : {};
  const data = await getMemberDetailData(memberId, {
    selectedEmailId: typeof query.email === "string" ? query.email : null,
  });

  // Out-of-scope members are indistinguishable from missing ones on purpose.
  if (!data) {
    notFound();
  }

  const enabledProvisionFields = (data.workspace.provisionFields ?? [])
    .filter((field) => field.enabled)
    .flatMap((field) => {
      const definition = WORKSPACE_FIELD_MAP.get(field.fieldKey);
      if (!definition) return [];

      const enabled: EnabledProvisionField = {
        fieldKey: field.fieldKey,
        enabled: field.enabled,
        required: field.required,
        source: field.source,
        label: definition.label,
        type: definition.type,
        placeholder: definition.placeholder,
        description: definition.description,
      };
      return [enabled];
    });

  // Deliberately not wrapped in `AppPage`: the member's own header is the
  // page title, so an eyebrow + title + rule above it is pure noise.
  return (
    <div className="flex flex-1 flex-col pb-8">
      <MemberDetailView
        data={data}
        workspaceProvisionFields={enabledProvisionFields}
        defaultTab={typeof query.tab === "string" ? query.tab : undefined}
      />
    </div>
  );
}
