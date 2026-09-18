import { describe, expect, it } from "vitest";

import {
  type PortalActionCategory,
  type PortalActionRow,
  type PortalActiveGroup,
  type PortalAvailableAction,
  resolveAvailableAction,
  resolveLeave,
} from "@/lib/groups/portal-actions";
import type { GroupJoinPolicy } from "@/server/db/schema";

const REQUESTED_AT = new Date("2026-09-01T10:00:00Z");
const DECIDED_AT = new Date("2026-09-02T10:00:00Z");

const single: PortalActionCategory = {
  selectionMode: "single",
  maxSelections: null,
  selectionRequired: false,
  showGroupsToNonMembers: false,
};
const multiple: PortalActionCategory = { ...single, selectionMode: "multiple" };
const multipleMax2: PortalActionCategory = { ...multiple, maxSelections: 2 };
const showing = (category: PortalActionCategory): PortalActionCategory => ({
  ...category,
  showGroupsToNonMembers: true,
});

const freeCurrent: PortalActiveGroup = { id: "cur", name: "Current", joinPolicy: "free_join_leave" };
const adminCurrent: PortalActiveGroup = { id: "cur", name: "Current", joinPolicy: "admin_only" };
const requestCurrent: PortalActiveGroup = { id: "cur", name: "Current", joinPolicy: "request_to_join" };

const rows = {
  none: null,
  pending: {
    status: "pending",
    requestedAt: REQUESTED_AT,
    decidedAt: null,
    declineReason: null,
    requestsBlocked: false,
  },
  declined: {
    status: "declined",
    requestedAt: REQUESTED_AT,
    decidedAt: DECIDED_AT,
    declineReason: "Full this season",
    requestsBlocked: false,
  },
  declinedBlocked: {
    status: "declined",
    requestedAt: REQUESTED_AT,
    decidedAt: DECIDED_AT,
    declineReason: null,
    requestsBlocked: true,
  },
} satisfies Record<string, PortalActionRow | null>;

function resolve(
  joinPolicy: GroupJoinPolicy,
  row: PortalActionRow | null,
  category: PortalActionCategory,
  myActiveInCategory: PortalActiveGroup[] = [],
) {
  return resolveAvailableAction({
    group: { id: "g", joinPolicy },
    row,
    category,
    myActiveInCategory,
  });
}

const pending: PortalAvailableAction = { kind: "pending", requestedAt: REQUESTED_AT };
const declined = (canRequestAgain: boolean, reason: string | null = "Full this season") =>
  ({ kind: "declined", decidedAt: DECIDED_AT, reason, canRequestAgain }) satisfies PortalAvailableAction;

describe("resolveAvailableAction — no existing row", () => {
  it.each<[string, GroupJoinPolicy, PortalActionCategory, PortalActiveGroup[], PortalAvailableAction | null]>([
    // admin_only: hidden unless the category opts in
    ["admin_only, hidden", "admin_only", single, [], null],
    ["admin_only, shown", "admin_only", showing(single), [], { kind: "ask_leader" }],
    ["admin_only, shown, already in a group", "admin_only", showing(single), [adminCurrent], { kind: "ask_leader" }],

    // free_join_leave
    ["free, single, nothing yet", "free_join_leave", single, [], { kind: "join" }],
    ["free, single, in a free group", "free_join_leave", single, [freeCurrent], { kind: "switch", from: { id: "cur", name: "Current" } }],
    ["free, single, in an admin-only group", "free_join_leave", single, [adminCurrent], { kind: "blocked", reason: "ask_leader_to_switch" }],
    ["free, single, in a request group", "free_join_leave", single, [requestCurrent], { kind: "blocked", reason: "ask_leader_to_switch" }],
    ["free, multi, below max", "free_join_leave", multipleMax2, [freeCurrent], { kind: "join" }],
    ["free, multi, at max", "free_join_leave", multipleMax2, [freeCurrent, adminCurrent], { kind: "blocked", reason: "max_selections_reached" }],
    ["free, multi, no max", "free_join_leave", multiple, [freeCurrent, adminCurrent, requestCurrent], { kind: "join" }],

    // request_to_join
    ["request, single, nothing yet", "request_to_join", single, [], { kind: "request" }],
    ["request, single, in a free group", "request_to_join", single, [freeCurrent], { kind: "blocked", reason: "leave_current_first" }],
    ["request, single, in an admin-only group", "request_to_join", single, [adminCurrent], { kind: "blocked", reason: "ask_leader_to_switch" }],
    ["request, multi, below max", "request_to_join", multipleMax2, [freeCurrent], { kind: "request" }],
    ["request, multi, at max", "request_to_join", multipleMax2, [freeCurrent, adminCurrent], { kind: "blocked", reason: "max_selections_reached" }],
  ])("%s", (_label, policy, category, mine, expected) => {
    expect(resolve(policy, rows.none, category, mine)).toEqual(expected);
  });
});

describe("resolveAvailableAction — an existing request wins", () => {
  it.each<GroupJoinPolicy>(["admin_only", "free_join_leave", "request_to_join"])(
    "pending on a %s group is shown as pending",
    (policy) => {
      expect(resolve(policy, rows.pending, single)).toEqual(pending);
    },
  );

  it("pending is shown even when the category hides its groups and the policy became admin_only", () => {
    // The member asked; hiding the row would make their request vanish.
    expect(resolve("admin_only", rows.pending, single)).toEqual(pending);
  });

  it("declined on a request group with no other constraint may request again", () => {
    expect(resolve("request_to_join", rows.declined, single)).toEqual(declined(true));
    expect(resolve("request_to_join", rows.declined, multipleMax2, [freeCurrent])).toEqual(declined(true));
  });

  it("declined + blocked may not request again", () => {
    expect(resolve("request_to_join", rows.declinedBlocked, single)).toEqual(declined(false, null));
  });

  it("declined, then placed elsewhere in a single-select category: still shown, cannot request again", () => {
    // A re-request could never be approved, so the button goes away but the
    // decision stays visible.
    expect(resolve("request_to_join", rows.declined, single, [adminCurrent])).toEqual(declined(false));
    expect(resolve("request_to_join", rows.declined, single, [freeCurrent])).toEqual(declined(false));
  });

  it("declined at the multi-select maximum cannot request again", () => {
    expect(resolve("request_to_join", rows.declined, multipleMax2, [freeCurrent, adminCurrent])).toEqual(
      declined(false),
    );
  });

  it("declined on a group whose policy changed away from request_to_join: shown, cannot request again", () => {
    expect(resolve("admin_only", rows.declined, single)).toEqual(declined(false));
    expect(resolve("admin_only", rows.declined, showing(single))).toEqual(declined(false));
    // free_join_leave would offer "join", not "request"; the member should join
    // from the fresh-join path, and the stale decision stays on record.
    expect(resolve("free_join_leave", rows.declined, single)).toEqual(declined(false));
  });
});

describe("resolveLeave", () => {
  const free = { id: "g", joinPolicy: "free_join_leave" as const };
  const mineHere: PortalActiveGroup = { ...free, name: "Here" };

  it.each<[string, GroupJoinPolicy, boolean, PortalActiveGroup[], { canLeave: boolean; reason: string | null }]>([
    ["free, optional, only group", "free_join_leave", false, [mineHere], { canLeave: true, reason: null }],
    ["free, required, only group", "free_join_leave", true, [mineHere], { canLeave: false, reason: "selection_required" }],
    ["free, required, another group too", "free_join_leave", true, [mineHere, freeCurrent], { canLeave: true, reason: null }],
    ["admin_only", "admin_only", false, [mineHere], { canLeave: false, reason: "policy" }],
    ["request_to_join", "request_to_join", false, [mineHere], { canLeave: false, reason: "policy" }],
  ])("%s", (_label, policy, selectionRequired, mine, expected) => {
    expect(resolveLeave({ id: "g", joinPolicy: policy }, { selectionRequired }, mine)).toEqual(expected);
  });
});
