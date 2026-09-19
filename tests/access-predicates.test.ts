import { describe, expect, it } from "vitest";

import {
  canManageCategory,
  canManageGroup,
  canManageOwner,
  canOverseeCategory,
  getAdminAccessLevel,
  getCapabilities,
  overseenCategoryIds,
} from "@/lib/access/viewer";
import { makeViewer } from "./helpers/viewer";

/**
 * The access rules over a hand-built Viewer (CONTEXT.md). Each rule is spelled
 * once in `lib/access/viewer.ts`; the throwing guards and the safe-action
 * middleware only wrap what is pinned here.
 */

const GROUP = { id: "group-a", categoryId: "cat-1" };
const OTHER_GROUP = { id: "group-b", categoryId: "cat-1" };
const FOREIGN_GROUP = { id: "group-z", categoryId: "cat-9" };

const systemAdmin = makeViewer({ systemRole: "system_admin", member: null });
const orgAdmin = makeViewer({ member: { role: "org_admin" } });
const leader = makeViewer({ member: { role: "leader" } });
const categoryAdmin = makeViewer({ scope: { categoryIds: ["cat-1"] } });
const groupAdmin = makeViewer({
  scope: { groups: [{ id: "group-a", categoryId: "cat-1", managesMembers: true }] },
});
const plainMember = makeViewer({});
const pendingCategoryAdmin = makeViewer({
  member: { status: "pending" },
  scope: { categoryIds: ["cat-1"] },
});

describe("admin access level and capabilities", () => {
  it("system admins and org admins are full, scoped admins are scoped, members are none", () => {
    expect(getAdminAccessLevel(systemAdmin)).toBe("full");
    expect(getAdminAccessLevel(orgAdmin)).toBe("full");
    expect(getAdminAccessLevel(leader)).toBe("scoped");
    expect(getAdminAccessLevel(categoryAdmin)).toBe("scoped");
    expect(getAdminAccessLevel(groupAdmin)).toBe("scoped");
    expect(getAdminAccessLevel(plainMember)).toBe("none");
  });

  it("a system admin without a membership reaches admin but not the portal", () => {
    const capabilities = getCapabilities(systemAdmin);
    expect(capabilities.canAccessAdmin).toBe(true);
    expect(capabilities.canAccessPortal).toBe(false);
  });

  it("scoped rows do nothing for a member who is not active", () => {
    expect(getAdminAccessLevel(pendingCategoryAdmin)).toBe("none");
    expect(getCapabilities(pendingCategoryAdmin).canAccessAdmin).toBe(false);
    expect(canManageCategory(pendingCategoryAdmin, "cat-1")).toBe(false);
  });

  it("only a group admin in a category that delegates member management gets scoped members", () => {
    expect(getCapabilities(groupAdmin).canManageScopedMembers).toBe(true);
    const undelegated = makeViewer({
      scope: { groups: [{ id: "group-a", categoryId: "cat-1", managesMembers: false }] },
    });
    expect(getCapabilities(undelegated).canManageScopedMembers).toBe(false);
    expect(getCapabilities(undelegated).canAccessAdmin).toBe(true);
  });
});

describe("groups and categories", () => {
  it("full admins and leaders manage every group", () => {
    for (const viewer of [systemAdmin, orgAdmin, leader]) {
      expect(canManageGroup(viewer, FOREIGN_GROUP)).toBe(true);
      expect(canManageCategory(viewer, "cat-9")).toBe(true);
      expect(overseenCategoryIds(viewer)).toBeNull();
    }
  });

  it("a category admin manages every group in the category and nothing outside it", () => {
    expect(canManageGroup(categoryAdmin, GROUP)).toBe(true);
    expect(canManageGroup(categoryAdmin, OTHER_GROUP)).toBe(true);
    expect(canManageGroup(categoryAdmin, FOREIGN_GROUP)).toBe(false);
    expect(canManageCategory(categoryAdmin, "cat-1")).toBe(true);
    expect(canManageCategory(categoryAdmin, "cat-9")).toBe(false);
  });

  it("a group admin manages their group, oversees its category, but does not manage the category", () => {
    expect(canManageGroup(groupAdmin, GROUP)).toBe(true);
    expect(canManageGroup(groupAdmin, OTHER_GROUP)).toBe(false);
    expect(canManageCategory(groupAdmin, "cat-1")).toBe(false);
    expect(canOverseeCategory(groupAdmin, "cat-1")).toBe(true);
    expect(canOverseeCategory(groupAdmin, "cat-9")).toBe(false);
    expect(overseenCategoryIds(groupAdmin)).toEqual(["cat-1"]);
  });

  it("a plain member manages nothing", () => {
    expect(canManageGroup(plainMember, GROUP)).toBe(false);
    expect(canOverseeCategory(plainMember, "cat-1")).toBe(false);
    expect(overseenCategoryIds(plainMember)).toEqual([]);
  });
});

describe("event and form owners", () => {
  it("group and category owners follow their owner's management rule", () => {
    expect(canManageOwner(groupAdmin, { type: "group", group: GROUP })).toBe(true);
    expect(canManageOwner(groupAdmin, { type: "category", categoryId: "cat-1" })).toBe(false);
    expect(canManageOwner(categoryAdmin, { type: "category", categoryId: "cat-1" })).toBe(true);
    expect(canManageOwner(categoryAdmin, { type: "group", group: FOREIGN_GROUP })).toBe(false);
  });

  it("full admins and leaders always manage organization-wide events", () => {
    for (const viewer of [systemAdmin, orgAdmin, leader]) {
      expect(canManageOwner(viewer, { type: "organization" })).toBe(true);
    }
  });

  describe("organization-wide owner by orgEventCreators", () => {
    const withSetting = (viewer: ReturnType<typeof makeViewer>, orgEventCreators: "org_admins" | "category_admins" | "any_admin") =>
      ({ ...viewer, organization: { ...viewer.organization, orgEventCreators } });

    it("org_admins: no scoped admin may", () => {
      expect(canManageOwner(withSetting(categoryAdmin, "org_admins"), { type: "organization" })).toBe(false);
      expect(canManageOwner(withSetting(groupAdmin, "org_admins"), { type: "organization" })).toBe(false);
    });

    it("category_admins: category admins may, group admins may not", () => {
      expect(canManageOwner(withSetting(categoryAdmin, "category_admins"), { type: "organization" })).toBe(true);
      expect(canManageOwner(withSetting(groupAdmin, "category_admins"), { type: "organization" })).toBe(false);
    });

    it("any_admin: category admins and group admins may, plain members never", () => {
      expect(canManageOwner(withSetting(categoryAdmin, "any_admin"), { type: "organization" })).toBe(true);
      expect(canManageOwner(withSetting(groupAdmin, "any_admin"), { type: "organization" })).toBe(true);
      expect(canManageOwner(withSetting(plainMember, "any_admin"), { type: "organization" })).toBe(false);
      expect(canManageOwner(withSetting(pendingCategoryAdmin, "any_admin"), { type: "organization" })).toBe(false);
    });
  });
});
