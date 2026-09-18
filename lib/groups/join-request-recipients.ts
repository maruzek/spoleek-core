/**
 * Who hears that a member asked to join a group. Pure: the DB fetch lives in
 * `server/notifications/recipients.ts`, this only picks the tier.
 *
 * Tiers, first non-empty wins:
 *   1. the group's own notification address
 *   2. the linked Workspace group, when the group routes alerts there
 *   3. the group's active admins — only when the category lets group admins
 *      manage members; otherwise they cannot act on the request and are skipped
 *   4. the category's admins
 *   5. the organization's admins
 *
 * Unlike registration alerts these do not fan out across tiers: a join request
 * is routine, and the goal is one mailbox that can act, not everyone who could.
 */
export type JoinRequestRecipient = {
  email: string;
  name: string | null;
  reason: "group_address" | "workspace_group" | "group_admin" | "category_admin" | "org_admin";
};

export type JoinRequestRecipientInput = {
  /** `organizations.emailNotifyJoinRequest`. Off means nobody, whatever else says. */
  enabled: boolean;
  groupNotificationEmail: string | null;
  /** Set when `groups.notifyViaWorkspaceGroup` and the link is enabled with an address. */
  workspaceGroupEmail: string | null;
  groupAdminsManageMembers: boolean;
  groupAdmins: Array<{ email: string | null; name: string | null }>;
  categoryAdmins: Array<{ email: string | null; name: string | null }>;
  orgAdmins: Array<{ email: string | null; name: string | null }>;
};

function withEmail(
  people: Array<{ email: string | null; name: string | null }>,
  reason: JoinRequestRecipient["reason"],
): JoinRequestRecipient[] {
  const seen = new Set<string>();
  const out: JoinRequestRecipient[] = [];

  for (const person of people) {
    const email = person.email?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: person.name, reason });
  }

  return out;
}

export function pickJoinRequestRecipients(input: JoinRequestRecipientInput): JoinRequestRecipient[] {
  if (!input.enabled) {
    return [];
  }

  if (input.groupNotificationEmail) {
    return [{ email: input.groupNotificationEmail, name: null, reason: "group_address" }];
  }

  if (input.workspaceGroupEmail) {
    return [{ email: input.workspaceGroupEmail, name: null, reason: "workspace_group" }];
  }

  if (input.groupAdminsManageMembers) {
    const admins = withEmail(input.groupAdmins, "group_admin");
    if (admins.length > 0) return admins;
  }

  const categoryAdmins = withEmail(input.categoryAdmins, "category_admin");
  if (categoryAdmins.length > 0) return categoryAdmins;

  return withEmail(input.orgAdmins, "org_admin");
}
