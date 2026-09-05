import { describe, expect, it } from "vitest";

import {
  getApprovalDecision,
  getConfirmationBasis,
  isReportGroupFrozen,
} from "@/server/lib/membership-report";
import { classifyMissingMember } from "@/server/queries/membership-reports";
import {
  REPORT_GROUP_STATUS_ORDER,
  compareReportGroupStatus,
  describeReportGroupStatus,
} from "@/lib/membership-report-status";
import type { MembershipReportGroupStatus } from "@/server/db/schema";

describe("getConfirmationBasis", () => {
  it("counts a paid membership as paid", () => {
    expect(
      getConfirmationBasis({ status: "paid", cancellationReason: null }),
    ).toBe("paid");
  });

  it("counts a waived membership as waived, not as paid", () => {
    // The board reads "34 paid, 2 waived", not a flat 36: waiving is a
    // decision somebody made and stays visible as one.
    expect(
      getConfirmationBasis({ status: "cancelled", cancellationReason: "waived" }),
    ).toBe("waived");
  });

  it.each(["duplicate", "admin_error", "left_organization", null])(
    "confirms nothing for a payment cancelled as %s",
    (reason) => {
      expect(
        getConfirmationBasis({ status: "cancelled", cancellationReason: reason }),
      ).toBeNull();
    },
  );

  it.each(["pending", "overdue", "failed"])(
    "confirms nothing while a payment is %s",
    (status) => {
      expect(getConfirmationBasis({ status, cancellationReason: null })).toBeNull();
    },
  );

  it("ignores a waived reason on a payment that was not cancelled", () => {
    // Only the pair means anything. A pending payment carrying a stale reason
    // must not confirm a membership nobody decided on.
    expect(
      getConfirmationBasis({ status: "pending", cancellationReason: "waived" }),
    ).toBeNull();
  });
});

/**
 * The freeze is invariant 1: once a roster is signed off, anything confirmed
 * afterwards queues instead of changing an approved number. Three write paths
 * ask this one function — the payment sync, the backfill on open, and the
 * manual add — so this is the single place the rule is stated.
 */
describe("isReportGroupFrozen", () => {
  it.each(["submitted", "approved"] as const)(
    "freezes a %s roster",
    (status) => {
      expect(isReportGroupFrozen(status)).toBe(true);
    },
  );

  it.each(["not_started", "in_progress", "returned"] as const)(
    "leaves a %s roster open",
    (status) => {
      expect(isReportGroupFrozen(status)).toBe(false);
    },
  );

  it("has an answer for every status the schema allows", () => {
    // A status added later must be classified deliberately rather than
    // falling through to "not frozen" and quietly bypassing the freeze.
    for (const status of REPORT_GROUP_STATUS_ORDER) {
      expect(typeof isReportGroupFrozen(status)).toBe("boolean");
    }
    expect(REPORT_GROUP_STATUS_ORDER).toHaveLength(5);
  });
});

describe("report group status presentation", () => {
  it("sorts the rows that need chasing to the top", () => {
    const statuses: MembershipReportGroupStatus[] = [
      "approved",
      "not_started",
      "submitted",
      "returned",
      "in_progress",
    ];

    expect([...statuses].sort(compareReportGroupStatus)).toEqual([
      "returned",
      "not_started",
      "in_progress",
      "submitted",
      "approved",
    ]);
  });

  it("names the group in the description", () => {
    // A bare "Not started" next to a year reads as though the year had not
    // started. The sentence has to say whose report it is.
    expect(describeReportGroupStatus("not_started", "North Region")).toContain(
      "North Region",
    );
    expect(describeReportGroupStatus("not_started", "North Region")).not.toContain(
      "{group}",
    );
  });
});

/**
 * The approval rules, shared by the single approve and the bulk approve so the
 * two cannot drift. The self-approval guard is the one that matters in a batch:
 * it is per row, and a row it stops has to be reported rather than dropped.
 */
describe("getApprovalDecision", () => {
  const base = {
    reportStatus: "open",
    groupStatus: "submitted" as const,
    submittedByUserId: "user-region",
    approverUserId: "user-board",
    allowSelfApproval: false,
  };

  it("approves a submitted report for somebody who did not submit it", () => {
    expect(getApprovalDecision(base)).toEqual({
      approve: true,
      selfApproved: false,
    });
  });

  it("refuses when the report is closed", () => {
    const decision = getApprovalDecision({ ...base, reportStatus: "closed" });
    expect(decision).toMatchObject({ approve: false, code: "report_closed" });
  });

  it.each(["not_started", "in_progress", "returned", "approved"] as const)(
    "refuses a report that is %s rather than submitted",
    (groupStatus) => {
      expect(getApprovalDecision({ ...base, groupStatus })).toMatchObject({
        approve: false,
        code: "not_submitted",
      });
    },
  );

  it("refuses a self-approval by default", () => {
    const decision = getApprovalDecision({
      ...base,
      approverUserId: "user-region",
    });

    expect(decision).toMatchObject({
      approve: false,
      code: "self_approval",
      reason: "you submitted it yourself",
    });
  });

  it("allows a self-approval when the organization opted in, and records it", () => {
    // The flag can be turned back off later, so the exception has to be marked
    // on the row rather than inferred from the setting afterwards.
    expect(
      getApprovalDecision({
        ...base,
        approverUserId: "user-region",
        allowSelfApproval: true,
      }),
    ).toEqual({ approve: true, selfApproved: true });
  });

  it("does not treat an unattributed submission as a self-approval", () => {
    // `submitted_by_member_id` nulls out when the member record goes. Nobody
    // owns the submission, so nobody is approving their own work.
    expect(
      getApprovalDecision({ ...base, submittedByUserId: null }),
    ).toEqual({ approve: true, selfApproved: false });
  });

  it("checks the report before the submission state", () => {
    // A closed report is the more fundamental refusal: it explains why nothing
    // on the page can be acted on, where "not waiting for approval" sends the
    // reader looking at the row.
    expect(
      getApprovalDecision({
        ...base,
        reportStatus: "closed",
        groupStatus: "approved",
      }),
    ).toMatchObject({ code: "report_closed" });
  });
});

/**
 * A member on last year's roster and not on this one is usually not a problem:
 * they moved region, or they left. Only the third case is somebody to chase,
 * and a panel that flags all three stops being read.
 */
describe("classifyMissingMember", () => {
  it("calls a member who is on another group's roster this year moved", () => {
    expect(
      classifyMissingMember({
        movedToGroupName: "Brno",
        memberStatus: "active",
      }),
    ).toBe("moved");
  });

  it.each(["archived", "suspended", "deleted", "pending", "invited"])(
    "calls a %s member gone rather than unpaid",
    (memberStatus) => {
      expect(
        classifyMissingMember({ movedToGroupName: null, memberStatus }),
      ).toBe("left");
    },
  );

  it("calls a still-active member unpaid", () => {
    expect(
      classifyMissingMember({ movedToGroupName: null, memberStatus: "active" }),
    ).toBe("unpaid");
  });

  it("treats a vanished member record as gone, not as somebody to chase", () => {
    // `member_id` nulls out on delete, and the row keeps the name it was
    // reported under. There is nobody left to ask for a payment.
    expect(
      classifyMissingMember({ movedToGroupName: null, memberStatus: null }),
    ).toBe("left");
  });

  it("prefers the move over the membership status", () => {
    // Somebody who transferred and was then archived is still explained by the
    // transfer: they are on another region's roster, so they were reported.
    expect(
      classifyMissingMember({
        movedToGroupName: "Ostrava",
        memberStatus: "archived",
      }),
    ).toBe("moved");
  });
});
