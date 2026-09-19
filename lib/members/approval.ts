import type { Organization } from "@/server/db/schema";

/**
 * Approval route — see CONTEXT.md.
 *
 * Which door a `pending` member leaves through is a function of three
 * organization settings and three acknowledgement flags, nothing else. This
 * module answers that question without touching the database so the whole
 * matrix is testable; `approveMember` in `server/lib/member-lifecycle.ts`
 * performs the route it is handed.
 */

export type ApprovalSettings = Pick<
  Organization,
  | "workspaceModuleEnabled"
  | "workspaceConnectedAt"
  | "workspaceDomain"
  | "setupAuthStrategy"
>;

export type ApprovalFlags = {
  /**
   * The admin was told the Workspace module is enabled but not connected, and
   * chose to approve without a Google account anyway.
   */
  acknowledgeWorkspaceUnavailable: boolean;
  /**
   * The admin deliberately approved without provisioning a Google account.
   * Distinct from `acknowledgeWorkspaceUnavailable`, which is about a broken
   * connection — this one is a choice, and it stands even when Workspace is
   * perfectly healthy.
   */
  skipWorkspaceAccount: boolean;
  /**
   * The admin has seen that this applicant is below the organization's minimum
   * age and is approving anyway — with a guardian countersignature on file, or
   * because the age on record is wrong.
   */
  acknowledgeUnderAge: boolean;
  /** The Google primary email to create, when the workspace route is taken. */
  workspaceEmail: string | null;
};

/** What `getMemberAgeSignal` reports; null when the org does not check age. */
export type ApprovalAgeSignal = {
  age: number | null;
  minimumAge: number;
  isUnderAge: boolean;
} | null;

export type ApprovalRoute =
  /** A Google account is created; the welcome email carries the password. */
  | { via: "workspace"; status: "active" }
  /** Email-password sign-in: the member activates through an invite. */
  | { via: "invite"; status: "invited" }
  /** Google-only sign-in: nothing to send, the member can sign in now. */
  | { via: "direct"; status: "active" };

export type ApprovalRefusal = {
  reason: "under_age" | "workspace_email_required" | "workspace_not_connected";
  message: string;
};

export type ApprovalDecision =
  | { ok: true; route: ApprovalRoute }
  | { ok: false; refusal: ApprovalRefusal };

export function isWorkspaceModuleReady(organization: {
  workspaceModuleEnabled: boolean;
  workspaceConnectedAt: Date | null;
  workspaceDomain: string | null;
}) {
  return (
    organization.workspaceModuleEnabled &&
    organization.workspaceConnectedAt !== null &&
    Boolean(organization.workspaceDomain)
  );
}

export function usesEmailPasswordActivation(authStrategy: string | null) {
  return (
    authStrategy === "email-password" ||
    authStrategy === "email-password-google"
  );
}

/**
 * Decides the route, or refuses. Refusals are ordered by how much the admin
 * has to go and do: age first (a decision somebody has to make on purpose,
 * never something discovered after provisioning), then the Workspace
 * preconditions.
 */
export function resolveApprovalRoute(
  settings: ApprovalSettings,
  flags: ApprovalFlags,
  ageSignal: ApprovalAgeSignal,
): ApprovalDecision {
  if (!flags.acknowledgeUnderAge && ageSignal?.isUnderAge) {
    return refuse(
      "under_age",
      ageSignal.age == null
        ? "This applicant has no date of birth on record, so their age cannot be checked against the minimum. Confirm it before approving."
        : `This applicant is ${ageSignal.age}, below the minimum age of ${ageSignal.minimumAge}. Confirm a guardian has countersigned before approving.`,
    );
  }

  if (isWorkspaceModuleReady(settings) && !flags.skipWorkspaceAccount) {
    if (!flags.workspaceEmail) {
      return refuse(
        "workspace_email_required",
        "A Workspace email is required to approve this member.",
      );
    }
    return { ok: true, route: { via: "workspace", status: "active" } };
  }

  // The module is switched on but the OAuth connection was never completed.
  // Approving still works, it just creates no Google account — so the admin
  // must have seen the warning rather than provisioning being skipped silently.
  if (
    settings.workspaceModuleEnabled &&
    !flags.acknowledgeWorkspaceUnavailable &&
    !flags.skipWorkspaceAccount
  ) {
    return refuse(
      "workspace_not_connected",
      "Google Workspace is enabled but not connected, so no account can be created. Connect it in Settings → Google Workspace, or approve without a Workspace account.",
    );
  }

  return usesEmailPasswordActivation(settings.setupAuthStrategy)
    ? { ok: true, route: { via: "invite", status: "invited" } }
    : { ok: true, route: { via: "direct", status: "active" } };
}

function refuse(
  reason: ApprovalRefusal["reason"],
  message: string,
): ApprovalDecision {
  return { ok: false, refusal: { reason, message } };
}
