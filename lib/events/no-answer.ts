/**
 * The "No answer" stat next to "Invited".
 *
 * "Invited" counts people: every eligible member plus every external invitee.
 * The email recipient list (`getEventRecipients(…).not_responded`) is the
 * wrong source for the matching count — it drops members with no usable email
 * and folds members who share one, so the two numbers drift apart on any real
 * org. This counts people the same way "Invited" does.
 */
export type NoAnswerInput = {
  /** Member ids the audience rules resolve to right now. */
  eligibleMemberIds: ReadonlySet<string>;
  /** Lower-cased emails of the external invitees on the event. */
  externalEmails: readonly string[];
  /** Every response on the event: a member answered, or a guest by email. */
  responses: readonly { memberId: string | null; guestEmail: string | null }[];
};

export function countNoAnswer({ eligibleMemberIds, externalEmails, responses }: NoAnswerInput): number {
  const answeredMembers = new Set<string>();
  const answeredEmails = new Set<string>();
  for (const r of responses) {
    if (r.memberId) answeredMembers.add(r.memberId);
    if (r.guestEmail) answeredEmails.add(r.guestEmail.trim().toLowerCase());
  }

  let silentMembers = 0;
  for (const id of eligibleMemberIds) if (!answeredMembers.has(id)) silentMembers += 1;

  // Externals count too: "Invited" includes them, and the stat is about who
  // has not told you yet, not who was emailed.
  const silentExternals = externalEmails.filter((e) => !answeredEmails.has(e)).length;
  return silentMembers + silentExternals;
}
