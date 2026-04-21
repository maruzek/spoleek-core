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
