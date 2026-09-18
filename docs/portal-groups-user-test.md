# Portal groups self-service — live user test before production

**Feature:** members join, switch, leave and request groups from their portal; leaders approve or
decline (spec `docs/superpowers/specs/2026-09-17-portal-groups-self-service-design.md`, plan
`docs/superpowers/plans/2026-09-17-portal-groups-self-service-plan.md`, branch `portal-groups`).
**Date written:** 2026-09-18.
**Goal:** prove, with real people in real roles, that every card state on the portal is reachable
and round-trips, that a request never behaves like a membership anywhere, and that the emails
reach the right mailbox. Automated tests cover the decision rules
(`tests/portal-group-actions.test.ts`), the recipient chain (`tests/join-request-recipients.test.ts`)
and the DB invariant (`tests/group-membership-status.test.ts`); this document covers what only a
person in front of the app can check.

Mark each item ✅ / ❌ / ⚠️ and note the account used. Anything ❌ in sections 5–6 blocks release.

---

## 0. Set-up

**People needed (three browsers / profiles):**

| Role | Account | Why |
| --- | --- | --- |
| Org admin | `org_admin` member with a login | Settings, category form, full dashboard |
| Group admin | `group_admin` of the request group, **not** org admin, in a category with "Group admins manage members" on | Approve / decline from a scoped account; last-leader warning |
| Plain member | active member with a linked user, profile complete, policies acknowledged | Every portal card |

**Data needed** — fastest is `pnpm db:seed:groups` (`--reset` removes it), which creates:

- Category **Demo sections** — multi-select, max 2, "Show groups to non-members" on.
- **Demo climbing** (`free_join_leave`), **Demo hiking** (`request_to_join`), **Demo board** (`admin_only`); Dana Leader is group admin of all three.
- On Hiking: Eva's **pending** request (with a message) and Filip's **declined + blocked** request.

Plus, by hand, for the single-select cases:

- A **single-select, selection required** category with two `free_join_leave` groups and one `admin_only` group; put the plain member in one of the free groups.
- Resend configured and two mailboxes you can read (the leader's and the plain member's).

**How it is implemented (what to expect):**

- A request is a row in `group_memberships` with `status = pending | declined`. Only `active`
  rows are memberships: rosters, fees, event targeting, Workspace sync, notification recipients
  and admin scope all ignore requests.
- Every action re-checks the rules inside one transaction with the row locked; a stale button
  gets a readable error ("The group changed in the meantime…") rather than a wrong write.
- Every portal write ends in a server refresh, so the card always shows the real row.
- Admin UI is English only; the portal and both emails follow the org locale (EN/CS).

---

## 1. Portal — reading the page (plain member)

- [ ] `/portal/groups` lists every active category. Own groups as solid cards; **Groups you can join** underneath as dashed cards; categories with no groups at all are absent.
- [ ] Reveal animation runs once, top to bottom, continuous across own and available cards.
- [ ] A category with no own group and a joinable group shows "You are not in a … group. Pick one below."; one with only `admin_only` groups (and "show to non-members" off) shows the "ask an admin" copy and no sub-list.
- [ ] Available cards show name, description, leaders with ✉ mailto — no notices, no "Next up".
- [ ] Switch the org locale to `cs` → every string on the page, in the dialogs and toasts is Czech; counts decline correctly ("1 žádost čeká", "2 žádosti čekají", "5 žádostí čeká").

## 2. Portal — every card state (plain member, Demo sections)

| Card | Expected action | Check |
| --- | --- | --- |
| Demo climbing | **Join** button | [ ] |
| Demo hiking | **Ask to join** button | [ ] |
| Demo board | "Only a leader can add you…" + **Ask a leader** (mailto Dana) | [ ] |

- [ ] **Join** climbing → toast "You are now in Demo climbing." → card moves to own list; overflow menu (⋯) has **Leave group** enabled.
- [ ] **Ask to join** hiking → dialog with textarea; type 470+ chars → counter turns orange; 500 is the hard stop. Send → toast → card turns amber: "Requested <date> · Waiting for a leader." with pulsing dot and **Withdraw**.
- [ ] **Withdraw** → confirm → card returns to **Ask to join**. Ask again for the next section.
- [ ] Join a second free group in the category (create one or change Board to `free_join_leave` temporarily) → now at max 2 → any further card is **blocked**: "Leave a group first — you are at the limit here." with a disabled button.
- [ ] **Leave** climbing → confirm dialog → toast → card back in the available list as **Join**.
- [ ] Dashboard `/portal` "Your membership" shows "1 request waiting for a leader" while hiking is pending; the line links to `/portal/groups`; gone after approval / withdraw.

## 3. Portal — single-select category (plain member)

- [ ] In free group A, see group B (free) as **Switch** and the admin-only group as **Ask a leader** (or hidden when the category does not show groups to non-members).
- [ ] **Switch** to B → confirm text names both groups → toast "You switched to B." → A gone, B in own list. Admin roster of A no longer lists the member; B does.
- [ ] Set A to `admin_only` and be placed there by an admin → B shows **blocked** "Ask a leader to switch you." with a disabled Join.
- [ ] Add a `request_to_join` group C to this category → while in a free group, C is **blocked** "Leave your current group first."; while in an admin-only group, "Ask a leader to switch you."
- [ ] With selection required and only one group: **Leave group** in the ⋯ menu is disabled with "You need to stay in one group of this kind. Switch instead." underneath.

## 4. Admin — deciding (group admin, then org admin)

### 4.1 Requests tab
- [ ] `/admin/groups/<cat>/<hiking>` shows a **Requests** tab with an amber glowing **1** (Eva). Tabs for Climbing / Board have no Requests tab (policy not request, no requests).
- [ ] Open the link from the request email (`?tab=requests`) → lands on the tab directly.
- [ ] Pending table: Eva, her message as an indented quote (full text on hover), requested date, **Decline** / **Approve**. Search matches name, email and message text.
- [ ] **Declined (1)** collapsible: Filip, "declined <date> by Dana Leader", his message, the reason, and a **Block further requests** switch that is **on**.
- [ ] Toggle Filip's block off → toast; on the plain member's side (sign in as Filip if he has a login, or check the portal card copy) the declined card gains **Ask again**. Toggle back on → button disappears, "Further requests are closed for now".

### 4.2 Decisions
- [ ] **Approve** Eva → toast "Request approved — they are in." → she appears in the Members tab; the badge on the tab, on the category table and on `/admin/groups` disappears; the dashboard attention line is gone.
- [ ] Re-request as the plain member, then **Decline** → dialog shows their message, reason textarea (500 max, counter), "Block further requests" switch. Decline with a reason → toast → the row moves into Declined with your name as decider.
- [ ] Two approvers: open the same pending row in two browsers; approve in one, then decline in the other → the second sees "This request was already handled." and the row refreshes.
- [ ] Group admin in a category where "Group admins manage members" is **off** → cannot open the group page's Requests tab at all (forbidden); the request email went to the category / org admins instead.

### 4.3 Approval by another door
- [ ] With a pending request from the plain member, an admin uses **Add members** on the Members tab and picks them → they become active, the request row is gone, portal card moves to own list, no duplicate row.
- [ ] Same with **Add group admin** → they are active with role group admin.

## 5. Invariant — a request is not a membership

With the plain member's request on hiking **pending** (not approved):

- [ ] Hiking's Members tab does not list them; member count on the category table unchanged.
- [ ] A **targeted** event owned by hiking (audience = hiking) is not visible in their portal and they are not in its eligible count.
- [ ] If the category manages fees and hiking has a fee: no fee payment is generated for them (`/admin/payments`).
- [ ] If hiking is linked to a Google group: the sync plan does not add them.
- [ ] They do **not** get group-admin scope: promote nobody — simply confirm `/admin` is still forbidden / unchanged for them.
- [ ] Their data export (`/portal/profile` → export) lists the request under **groupJoinRequests** with the message, and **not** under group assignments.
- [ ] Membership report roster for the category does not include them.

## 6. Emails and settings (org admin + two mailboxes)

- [ ] `/admin/settings` → Email notifications → **Join requests → leaders** and **Join decisions → members** switches exist, default on, save and reload.
- [ ] Plain member requests → within a minute the **leader** (Dana's tier) receives "<name> asked to join Demo hiking" with the message quoted and a button to `…?tab=requests`. `/admin/email` shows one `group_join_requested` row.
- [ ] Set hiking's **notification address** → the next request goes there and **not** to the leaders. Clear it, link a Google group with "notify via Workspace group" → goes to the Google group address.
- [ ] Remove every group admin from hiking → request email goes to the **category** admins; remove those → to the **org** admins.
- [ ] Turn **Join requests → leaders** off → request → nobody is emailed, action still succeeds.
- [ ] Approve → member receives "You are now in Demo hiking" with a button to `/portal/groups`. Decline with a reason → "About your request to join Demo hiking" quoting the reason word for word; decline without → no reason block.
- [ ] Turn **Join decisions → members** off → decisions still work, no email, no `email_activity` row.
- [ ] Org locale `cs` → both emails arrive in Czech.

## 7. Category form and dashboard (org admin)

- [ ] Category form: **Show groups to non-members** switch beside **Pin to navigation**; save on / off; the portal hides or shows the `admin_only` group accordingly on reload.
- [ ] `/admin` dashboard: with requests in **one** group → attention line "N join request(s) waiting", detail names the group, link opens its Requests tab. With requests in **two** groups → detail "Across 2 groups…", link goes to `/admin/groups`. Waiting-since dates from the oldest request.
- [ ] Scoped group admin's dashboard shows the line only for groups they can decide on.
- [ ] `/admin/groups` overview: the Groups column shows the amber count per category with a tooltip; category table shows it beside the group name and links to the tab.

## 8. Clean-up

- [ ] `pnpm db:seed:groups --reset` removes the demo category, its groups, memberships and the three demo members; nothing else changes.
