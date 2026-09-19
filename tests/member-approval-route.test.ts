import { describe, expect, it } from "vitest";

import {
  resolveApprovalRoute,
  type ApprovalFlags,
  type ApprovalSettings,
} from "@/lib/members/approval";

/**
 * Which door a pending member leaves through is decided by three organization
 * settings and three acknowledgement flags. This is the whole matrix, with no
 * database: the DB test only has to prove each route writes what it says.
 */
const noFlags: ApprovalFlags = {
  acknowledgeWorkspaceUnavailable: false,
  skipWorkspaceAccount: false,
  acknowledgeUnderAge: false,
  workspaceEmail: null,
};

const workspaceReady: ApprovalSettings = {
  workspaceModuleEnabled: true,
  workspaceConnectedAt: new Date("2026-01-01"),
  workspaceDomain: "example.test",
  setupAuthStrategy: "google",
};

const workspaceOff: ApprovalSettings = {
  workspaceModuleEnabled: false,
  workspaceConnectedAt: null,
  workspaceDomain: null,
  setupAuthStrategy: "google",
};

const workspaceHalfConnected: ApprovalSettings = {
  ...workspaceOff,
  workspaceModuleEnabled: true,
};

const adult = { age: 30, minimumAge: 18, isUnderAge: false };
const minor = { age: 15, minimumAge: 18, isUnderAge: true };
const unknownAge = { age: null, minimumAge: 18, isUnderAge: true };

describe("approval route", () => {
  it("creates a Google account when Workspace is connected and an email is given", () => {
    expect(
      resolveApprovalRoute(
        workspaceReady,
        { ...noFlags, workspaceEmail: "jane@example.test" },
        null,
      ),
    ).toEqual({ ok: true, route: { via: "workspace", status: "active" } });
  });

  it("refuses the workspace route without an email", () => {
    const decision = resolveApprovalRoute(workspaceReady, noFlags, null);
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.refusal.reason).toBe("workspace_email_required");
    }
  });

  it("skipping the account is a choice that stands even when Workspace is healthy", () => {
    expect(
      resolveApprovalRoute(
        workspaceReady,
        { ...noFlags, skipWorkspaceAccount: true },
        null,
      ),
    ).toEqual({ ok: true, route: { via: "direct", status: "active" } });
  });

  it("refuses a half-connected module until the admin has seen the warning", () => {
    const refused = resolveApprovalRoute(workspaceHalfConnected, noFlags, null);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.refusal.reason).toBe("workspace_not_connected");
    }

    expect(
      resolveApprovalRoute(
        workspaceHalfConnected,
        { ...noFlags, acknowledgeWorkspaceUnavailable: true },
        null,
      ),
    ).toEqual({ ok: true, route: { via: "direct", status: "active" } });
  });

  it("invites instead of activating when members sign in with a password", () => {
    for (const setupAuthStrategy of ["email-password", "email-password-google"]) {
      expect(
        resolveApprovalRoute({ ...workspaceOff, setupAuthStrategy }, noFlags, null),
      ).toEqual({ ok: true, route: { via: "invite", status: "invited" } });
    }
  });

  it("activates directly when there is nothing to send", () => {
    expect(resolveApprovalRoute(workspaceOff, noFlags, null)).toEqual({
      ok: true,
      route: { via: "direct", status: "active" },
    });
  });

  it("refuses an under-age applicant before any other check", () => {
    // Workspace would also refuse (no email) — age must win, because it is
    // the decision somebody has to make on purpose.
    const decision = resolveApprovalRoute(workspaceReady, noFlags, minor);
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.refusal.reason).toBe("under_age");
      expect(decision.refusal.message).toContain("15");
    }
  });

  it("a missing birth date is not 'old enough'", () => {
    const decision = resolveApprovalRoute(workspaceOff, noFlags, unknownAge);
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.refusal.reason).toBe("under_age");
      expect(decision.refusal.message).toContain("no date of birth");
    }
  });

  it("the age acknowledgement, or an adult, or an org that does not check, all pass", () => {
    const direct = { ok: true, route: { via: "direct", status: "active" } };
    expect(
      resolveApprovalRoute(workspaceOff, { ...noFlags, acknowledgeUnderAge: true }, minor),
    ).toEqual(direct);
    expect(resolveApprovalRoute(workspaceOff, noFlags, adult)).toEqual(direct);
    expect(resolveApprovalRoute(workspaceOff, noFlags, null)).toEqual(direct);
  });
});
