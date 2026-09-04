import type { MemberInviteState } from "@/server/queries/members";
import type { TenantMember } from "@/server/db/schema";

export type MemberInviteSummary = {
  value: string;
  description: string;
};

/**
 * Human-readable state of the *activation* invite (the email that lets a member
 * set a password). Members awaiting approval have deliberately not received one
 * yet — the acknowledgement email they got at registration is a different kind
 * of mail, so say so instead of implying something failed.
 */
export function describeMemberInvite(
  member: Pick<TenantMember, "email" | "status">,
  inviteState: MemberInviteState,
): MemberInviteSummary {
  if (!member.email) {
    return {
      value: "No email on file",
      description:
        "Invites stay disabled until the member has an email address.",
    };
  }

  if (!inviteState.status) {
    if (member.status === "pending") {
      return {
        value: "Sent after approval",
        description:
          "The activation email goes out once you approve this member.",
      };
    }

    return {
      value: "No invite sent",
      description: "This member has not received an activation email yet.",
    };
  }

  const issue =
    inviteState.deliveryStatus &&
    inviteState.deliveryStatus !== "pending" &&
    inviteState.deliveryStatus !== "sent"
      ? `Delivery ${inviteState.deliveryStatus.replace("_", " ")}.`
      : undefined;

  return {
    value: inviteState.status.replace("_", " "),
    description: inviteState.lastError ?? issue ?? "Invite state is healthy.",
  };
}
