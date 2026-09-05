export type EmailPreference = "personal" | "workspace";

export function resolvePreferredEmail({
  personalEmail,
  workspaceEmail,
  memberPreference,
  orgDefault,
  workspaceReady,
}: {
  personalEmail: string | null;
  workspaceEmail: string | null;
  memberPreference: EmailPreference | null;
  orgDefault: EmailPreference;
  workspaceReady: boolean;
}): string | null {
  const effective = memberPreference ?? orgDefault;
  if (effective === "workspace" && workspaceReady && workspaceEmail) {
    return workspaceEmail;
  }
  return personalEmail ?? null;
}

/**
 * The address a member-facing email should go to, given the org's default and
 * the member's own override.
 *
 * Payment emails used to read `tenant_members.email` directly, so in a
 * Workspace-first organization a member who only has a Workspace address was
 * silently skipped — the send returned early on a null personal email and
 * nothing was logged. Every member-facing send resolves through here instead.
 */
export function resolveMemberEmailForOrg(params: {
  member: {
    email: string | null;
    workspaceUserEmail: string | null;
    preferredEmail: EmailPreference | null;
  };
  organization: {
    defaultEmailPreference: EmailPreference;
    workspaceModuleEnabled: boolean;
    workspaceConnectedAt: Date | null;
    workspaceDomain: string | null;
  };
}): string | null {
  const { member, organization } = params;
  const workspaceReady =
    organization.workspaceModuleEnabled &&
    organization.workspaceConnectedAt !== null &&
    Boolean(organization.workspaceDomain);

  return (
    resolvePreferredEmail({
      personalEmail: member.email,
      workspaceEmail: member.workspaceUserEmail,
      memberPreference: member.preferredEmail,
      orgDefault: organization.defaultEmailPreference,
      workspaceReady,
    }) ??
    // Last resort: if the preferred side is empty, use whatever address exists
    // rather than dropping the email entirely.
    member.email ??
    member.workspaceUserEmail
  );
}
