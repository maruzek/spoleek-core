import { describe, expect, it } from "vitest";

import {
  type GroupPageAccessInput,
  resolveEffectiveVisibility,
  resolveGroupPageAccess,
} from "@/lib/groups/portal-actions";
import type { GroupMembershipStatus, GroupPageVisibility } from "@/server/db/schema";

const ROW_STATUSES: Array<GroupMembershipStatus | null> = [null, "pending", "declined", "active"];
const PAGE_VISIBILITIES: GroupPageVisibility[] = ["inherit", "all_members", "members_only"];
const CATEGORY_FLAGS = [true, false];

function input(
  rowStatus: GroupMembershipStatus | null,
  pageVisibility: GroupPageVisibility,
  groupPagesVisibleToAllMembers: boolean,
  overrides: { groupActive?: boolean; categoryActive?: boolean } = {},
): GroupPageAccessInput {
  return {
    rowStatus,
    group: { isActive: overrides.groupActive ?? true, pageVisibility },
    category: {
      isActive: overrides.categoryActive ?? true,
      groupPagesVisibleToAllMembers,
    },
  };
}

describe("resolveEffectiveVisibility", () => {
  it("uses the group override when set", () => {
    expect(
      resolveEffectiveVisibility(
        { pageVisibility: "members_only" },
        { groupPagesVisibleToAllMembers: true },
      ),
    ).toBe("members_only");
    expect(
      resolveEffectiveVisibility(
        { pageVisibility: "all_members" },
        { groupPagesVisibleToAllMembers: false },
      ),
    ).toBe("all_members");
  });

  it("falls back to the category flag on inherit", () => {
    expect(
      resolveEffectiveVisibility(
        { pageVisibility: "inherit" },
        { groupPagesVisibleToAllMembers: true },
      ),
    ).toBe("all_members");
    expect(
      resolveEffectiveVisibility(
        { pageVisibility: "inherit" },
        { groupPagesVisibleToAllMembers: false },
      ),
    ).toBe("members_only");
  });
});

describe("resolveGroupPageAccess", () => {
  const cases = ROW_STATUSES.flatMap((rowStatus) =>
    PAGE_VISIBILITIES.flatMap((pageVisibility) =>
      CATEGORY_FLAGS.map((flag) => ({ rowStatus, pageVisibility, flag })),
    ),
  );

  it.each(cases)(
    "row=$rowStatus visibility=$pageVisibility categoryFlag=$flag",
    ({ rowStatus, pageVisibility, flag }) => {
      const result = resolveGroupPageAccess(input(rowStatus, pageVisibility, flag));

      const effective =
        pageVisibility === "inherit"
          ? flag
            ? "all_members"
            : "members_only"
          : pageVisibility;
      expect(result.effectiveVisibility).toBe(effective);

      if (rowStatus === "active") {
        expect(result.level).toBe("member");
      } else if (effective === "all_members") {
        // pending and declined rows are visitors, never members
        expect(result.level).toBe("visitor");
      } else {
        expect(result.level).toBeNull();
      }
    },
  );

  it("returns null for an inactive group even for an active member", () => {
    const result = resolveGroupPageAccess(
      input("active", "all_members", true, { groupActive: false }),
    );
    expect(result.level).toBeNull();
    expect(result.effectiveVisibility).toBe("all_members");
  });

  it("returns null for an inactive category even for an active member", () => {
    const result = resolveGroupPageAccess(
      input("active", "all_members", true, { categoryActive: false }),
    );
    expect(result.level).toBeNull();
  });
});
