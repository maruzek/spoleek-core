import { describe, expect, it } from "vitest";

import {
  getConfirmationBasis,
  isReportGroupFrozen,
} from "@/server/lib/membership-report";
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
