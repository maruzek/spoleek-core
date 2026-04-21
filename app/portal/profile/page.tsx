import { AppPage } from "@/components/app/app-page";
import { ProfileForm } from "@/components/app/profile-form";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import {
  getMemberCustomFieldAnswerMap,
  getPostApprovalCompleteness,
  listActiveMemberCustomFields,
} from "@/server/queries/member-custom-fields";

export default async function PortalProfilePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { member, organization } = await requireCurrentMemberAccess();
  const params = searchParams ? await searchParams : {};
  const workspaceReady =
    organization.workspaceModuleEnabled &&
    organization.workspaceConnectedAt !== null &&
    Boolean(organization.workspaceDomain);
  const [customFields, answerMap, completeness] = await Promise.all([
    listActiveMemberCustomFields(organization.id, [
      "registration",
      "post_approval",
      "optional",
    ]),
    getMemberCustomFieldAnswerMap(organization.id, member.id),
    getPostApprovalCompleteness(organization.id, member.id),
  ]);
  const showIncompleteBanner =
    params.incomplete === "1" || params.incomplete === "true";

  return (
    <AppPage
      eyebrow="Member portal"
      title="Manage your profile."
      description="Keep your core contact information current so admins do not need to chase manual updates."
    >
      <ProfileForm
        firstName={member.firstName}
        lastName={member.lastName}
        customFields={customFields}
        customFieldAnswers={answerMap}
        showIncompleteBanner={showIncompleteBanner}
        missingRequiredFieldLabels={completeness.missingRequiredFields.map(
          (field) => field.label,
        )}
        preferredEmail={member.preferredEmail}
        workspaceEmail={member.workspaceUserEmail ?? null}
        workspaceReady={workspaceReady}
        personalEmail={member.email ?? null}
      />
    </AppPage>
  );
}
