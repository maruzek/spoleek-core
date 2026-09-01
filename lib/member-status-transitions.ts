import type { UpdateMemberValues } from "@/lib/member-admin";

export type EditableMembershipStatus = UpdateMemberValues["status"];

/**
 * Statuses an admin may reach by plain editing.
 *
 * Approval is not a column write — `approveMemberAction` also provisions the
 * Workspace account, generates the membership payment, sends the activation
 * invite, and logs a `member_approved` event. Letting the edit form set
 * `active`/`invited` on a pending member silently skips all five, which is why
 * this policy is shared by the form and the server action instead of being a
 * `disabled` prop on a `<SelectItem>`.
 */
export function requiresApprovalFlow(
  from: EditableMembershipStatus,
  to: EditableMembershipStatus,
): boolean {
  if (from === to) return false;
  if (from !== "pending") return false;

  // TODO(policy): decide which targets a pending member may reach directly.
  return to === "active" || to === "invited";
}

export function describeApprovalRequirement(
  to: EditableMembershipStatus,
): string {
  return `Use "Approve member" to move this member to ${to}. Approval also provisions their account, sends the activation email, and records the approval.`;
}
