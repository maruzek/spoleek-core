import { describe, expect, it } from "vitest";

import {
  type JoinRequestRecipientInput,
  pickJoinRequestRecipients,
} from "@/lib/groups/join-request-recipients";

const lead = { email: "lead@example.test", name: "Lead" };
const lead2 = { email: "lead2@example.test", name: "Lead Two" };
const catAdmin = { email: "cat@example.test", name: "Cat" };
const board = { email: "board@example.test", name: "Board" };

const base: JoinRequestRecipientInput = {
  enabled: true,
  groupNotificationEmail: null,
  workspaceGroupEmail: null,
  groupAdminsManageMembers: true,
  groupAdmins: [lead, lead2],
  categoryAdmins: [catAdmin],
  orgAdmins: [board],
};

describe("pickJoinRequestRecipients", () => {
  it("sends nobody anything when the org switch is off", () => {
    expect(
      pickJoinRequestRecipients({ ...base, enabled: false, groupNotificationEmail: "x@example.test" }),
    ).toEqual([]);
  });

  it("prefers the group address over everyone", () => {
    expect(pickJoinRequestRecipients({ ...base, groupNotificationEmail: "climb@example.test" })).toEqual([
      { email: "climb@example.test", name: null, reason: "group_address" },
    ]);
  });

  it("then the Workspace group", () => {
    expect(pickJoinRequestRecipients({ ...base, workspaceGroupEmail: "climb-g@example.test" })).toEqual([
      { email: "climb-g@example.test", name: null, reason: "workspace_group" },
    ]);
  });

  it("then the group admins, all of them, when they may act", () => {
    expect(pickJoinRequestRecipients(base)).toEqual([
      { email: "lead@example.test", name: "Lead", reason: "group_admin" },
      { email: "lead2@example.test", name: "Lead Two", reason: "group_admin" },
    ]);
  });

  it("skips group admins entirely when the category does not let them manage members", () => {
    expect(pickJoinRequestRecipients({ ...base, groupAdminsManageMembers: false })).toEqual([
      { email: "cat@example.test", name: "Cat", reason: "category_admin" },
    ]);
  });

  it("falls through admins without an email", () => {
    expect(
      pickJoinRequestRecipients({ ...base, groupAdmins: [{ email: null, name: "Ghost" }] }),
    ).toEqual([{ email: "cat@example.test", name: "Cat", reason: "category_admin" }]);
  });

  it("ends at the org admins", () => {
    expect(pickJoinRequestRecipients({ ...base, groupAdmins: [], categoryAdmins: [] })).toEqual([
      { email: "board@example.test", name: "Board", reason: "org_admin" },
    ]);
  });

  it("dedupes addresses inside a tier, case-insensitively", () => {
    expect(
      pickJoinRequestRecipients({
        ...base,
        groupAdmins: [lead, { email: "LEAD@example.test", name: "Same person" }],
      }),
    ).toHaveLength(1);
  });
});
