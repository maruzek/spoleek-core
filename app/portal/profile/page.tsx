import { AppPage } from "@/components/app/app-page";
import { ProfileForm } from "@/components/app/profile-form";
import { resolveMemberEmailForOrg } from "@/server/lib/preferred-email";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { requireViewer } from "@/server/queries/viewer";
import {
  getMemberCustomFieldAnswerMap,
  listActiveMemberCustomFields,
} from "@/server/queries/member-custom-fields";
import { listMemberAcknowledgements } from "@/server/queries/policies";

export default async function PortalProfilePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Gated on policies but not on profile completeness: this page is where a
  // member completes their profile, so gating it on that would trap them.
  const viewer = await requireViewer();
  const { member, organization } = await requireCurrentMemberAccess(viewer, {
    requirePolicyAcknowledgement: true,
  });
  const params = searchParams ? await searchParams : {};
  const workspaceReady =
    organization.workspaceModuleEnabled &&
    organization.workspaceConnectedAt !== null &&
    Boolean(organization.workspaceDomain);
  const [customFields, answerMap, acknowledgements] = await Promise.all([
    listActiveMemberCustomFields(organization.id, [
      "registration",
      "post_approval",
      "optional",
    ]),
    getMemberCustomFieldAnswerMap(organization.id, member.id),
    listMemberAcknowledgements(organization.id, member.id),
  ]);
  const showIncompleteBanner =
    params.incomplete === "1" || params.incomplete === "true";

  return (
    <AppPage
      eyebrow="Member portal"
      title="Your profile."
      width="content"
      description={`What ${organization.name} knows about you, and where it reaches you.`}
    >
      <ProfileForm
        firstName={member.firstName}
        lastName={member.lastName}
        customFields={customFields}
        customFieldAnswers={answerMap}
        showIncompleteBanner={showIncompleteBanner}
        preferredEmail={member.preferredEmail}
        workspaceEmail={member.workspaceUserEmail ?? null}
        workspaceReady={workspaceReady}
        personalEmail={member.email ?? null}
        contactEmail={resolveMemberEmailForOrg({ member, organization })}
        membershipStatus={member.status}
        memberSince={member.linkedAt ?? member.createdAt}
        rosterOptOut={
          organization.showGroupRosters ? { hidden: member.hideFromGroupRosters } : null
        }
        acknowledgements={acknowledgements.map((row) => ({
          versionId: row.versionId,
          documentTitle: row.documentTitle,
          version: row.version,
          acknowledgedAt: row.acknowledgedAt,
          method: row.method,
          href: row.version
            ? `/portal/legal/${row.documentSlug}/v/${encodeURIComponent(row.version)}`
            : null,
        }))}
      />
    </AppPage>
  );
}
