import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { responseOwnerOf, selectAfterRsvpForm, tokenLinkState } from "@/lib/events/responder";
import { db, pool } from "@/server/db";
import {
  eventAudience,
  eventRsvpTokens,
  events,
  formSubmissions,
  forms,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import { upsertResponse } from "@/server/lib/events/responses";
import { issueRsvpToken } from "@/server/lib/events/tokens";
import {
  getResponderView,
  memberResponder,
  resolveTokenResponder,
  type ResponderView,
} from "@/server/queries/responder";

/**
 * The Responder (CONTEXT.md): one view builder behind the member, token and
 * guest doors, on a seeded public priced event with a required `after_rsvp`
 * form. Pins the rules the three pages used to drift on — which form is
 * prompted for, when the payment shows, whose name pays — and the token
 * door's dead / closed distinction.
 *
 * Needs a database. Creates its own organization and deletes it afterwards.
 */
const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

const DAY = 86_400_000;

suite("responder view", () => {
  let orgId: string;
  let otherOrgId: string;
  let tripId: string;
  let formId: string;
  let memberId: string;
  let shadowId: string;
  let memberToken: string;
  let externalToken: string;
  const externalEmail = "Aunt.Dana@example.test";

  const trip = () => db.select().from(events).where(eq(events.id, tripId)).then(([row]) => ({ event: row!, ownerName: null }));

  const answer = (owner: Parameters<typeof upsertResponse>[1]["responder"], guestCount = 0) =>
    db.transaction((tx) =>
      upsertResponse(tx, { orgId, eventId: tripId, responder: owner, answer: "yes", guestCount }),
    );

  /** The client slice must be the same shape whoever is looking. */
  function expectOneShape(view: ResponderView) {
    expect(Object.keys(view.rsvp).sort()).toEqual(
      ["afterRsvpForm", "current", "eventTitle", "maxGuests", "open", "payerName", "payment", "priced"].sort(),
    );
    expect(view.rsvp.open).toEqual({ open: true });
    expect(view.rsvp.priced).toBe(true);
    expect(view.rsvp.maxGuests).toBe(2);
    expect(view.counts.confirmedSeats).toBeGreaterThanOrEqual(0);
  }

  beforeAll(async () => {
    const suffix = Date.now();
    const [org] = await db
      .insert(organizations)
      .values({ name: "Responder Test Org", slug: `responder-${suffix}` })
      .returning({ id: organizations.id });
    orgId = org.id;
    const [other] = await db
      .insert(organizations)
      .values({ name: "Responder Other Org", slug: `responder-other-${suffix}` })
      .returning({ id: organizations.id });
    otherOrgId = other.id;

    const makeMember = async (firstName: string) => {
      const [row] = await db
        .insert(tenantMembers)
        .values({
          orgId,
          firstName,
          lastName: "Testcase",
          email: `${firstName.toLowerCase()}-${suffix}@example.test`,
          status: "active",
        })
        .returning({ id: tenantMembers.id });
      return row.id;
    };
    memberId = await makeMember("Member");
    shadowId = await makeMember("Shadow");

    const [event] = await db
      .insert(events)
      .values({
        orgId,
        slug: `trip-${suffix}`,
        title: "Weekend trip",
        ownerType: "organization",
        visibility: "public",
        status: "published",
        startsAt: new Date(Date.now() + 28 * DAY),
        rsvpDeadlineAt: new Date(Date.now() + 14 * DAY),
        maxGuestsPerResponse: 2,
        priceAmount: 35_000,
        priceCurrency: "CZK",
        priceBankAccount: "CZ6508000000192000145399",
      })
      .returning({ id: events.id });
    tripId = event.id;

    await db.insert(eventAudience).values({
      orgId,
      eventId: tripId,
      kind: "external",
      externalEmail: externalEmail.toLowerCase(),
      externalName: "Aunt Dana",
    });

    const [form] = await db
      .insert(forms)
      .values({
        orgId,
        title: "Dietary needs",
        ownerType: "organization",
        eventId: tripId,
        timing: "after_rsvp",
        status: "open",
        required: true,
        onlyRsvpYes: true,
      })
      .returning({ id: forms.id });
    formId = form.id;

    memberToken = await issueRsvpToken({ eventId: tripId, orgId, memberId: shadowId });
    externalToken = await issueRsvpToken({ eventId: tripId, orgId, externalEmail });
  });

  afterAll(async () => {
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
    if (otherOrgId) await db.delete(organizations).where(eq(organizations.id, otherOrgId));
    await pool.end();
  });

  it("member: nothing answered yet — no row, no payment, the required form waits for the RSVP", async () => {
    const view = await getResponderView(orgId, await trip(), memberResponder({ id: memberId, firstName: "Member", lastName: "Testcase" }));
    expectOneShape(view);
    expect(view.identity).toEqual({ kind: "member", memberId, eligible: true, rsvpAnswer: null });
    expect(view.rsvp.current).toBeNull();
    expect(view.rsvp.payment).toBeNull();
    expect(view.rsvp.payerName).toBe("Member Testcase");
    expect(view.forms.map((item) => item.form.id)).toEqual([formId]);
    expect(view.rsvp.afterRsvpForm?.form.id).toBe(formId);
    expect(view.rsvp.afterRsvpForm?.required).toBe(true);
    expect(view.rsvp.afterRsvpForm?.canSubmit).toEqual({ ok: false, reason: "RSVP_REQUIRED" });
  });

  it("member: after a yes the live payment and the answer are in the view, and the form is submittable", async () => {
    const responder = memberResponder({ id: memberId, firstName: "Member", lastName: "Testcase" });
    await answer(responseOwnerOf(responder), 1);

    const view = await getResponderView(orgId, await trip(), responder);
    expect(view.rsvp.current).toEqual({ answer: "yes", guestCount: 1, standing: "confirmed" });
    expect(view.rsvp.payment).toMatchObject({ status: "pending", amount: 70_000, currency: "CZK" });
    expect(view.identity).toMatchObject({ rsvpAnswer: "yes" });
    expect(view.rsvp.afterRsvpForm?.canSubmit).toEqual({ ok: true });
    expect(view.counts.confirmedSeats).toBe(2);
  });

  it("member: a submitted after-RSVP form is not prompted for again", async () => {
    await db.insert(formSubmissions).values({ orgId, formId, memberId, submittedAt: new Date() });

    const view = await getResponderView(orgId, await trip(), memberResponder({ id: memberId, firstName: "Member", lastName: "Testcase" }));
    expect(view.forms[0]?.submittedAt).not.toBeNull();
    expect(view.rsvp.afterRsvpForm).toBeNull();
    // The rule itself, so a page cannot re-express it differently.
    expect(selectAfterRsvpForm(view.forms)).toBeNull();
  });

  it("token (member holder): resolves to the member's row key and name; no account, so never redirected", async () => {
    const resolved = await resolveTokenResponder(orgId, memberToken, new Date());
    expect(resolved).not.toBeNull();
    const { responder } = resolved!;
    expect(responder).toMatchObject({ kind: "token", memberId: shadowId, guestEmail: null, displayName: "Shadow Testcase", memberUserId: null });
    expect(responseOwnerOf(responder)).toEqual({ memberId: shadowId });

    await answer(responseOwnerOf(responder));
    const view = await getResponderView(orgId, resolved!, responder);
    expectOneShape(view);
    expect(view.rsvp.current).toEqual({ answer: "yes", guestCount: 0, standing: "confirmed" });
    expect(view.rsvp.payment).toMatchObject({ status: "pending", amount: 35_000 });
    expect(view.rsvp.payerName).toBe("Shadow Testcase");
    expect(view.identity).toEqual({ kind: "token", memberId: shadowId, guestEmail: null, guestName: "Shadow Testcase", rsvpAnswer: "yes" });
  });

  it("token (external holder): keyed by lower-cased email, named by the audience rule", async () => {
    const resolved = await resolveTokenResponder(orgId, externalToken, new Date());
    const { responder } = resolved!;
    expect(responder).toMatchObject({ kind: "token", memberId: null, guestEmail: externalEmail.toLowerCase(), displayName: "Aunt Dana" });
    expect(responseOwnerOf(responder)).toEqual({ guestEmail: externalEmail.toLowerCase(), guestName: "Aunt Dana" });

    // Answered under a differently-cased address: still their row.
    await answer({ guestEmail: externalEmail.toUpperCase(), guestName: "Aunt Dana" }, 2);
    const view = await getResponderView(orgId, resolved!, responder);
    expectOneShape(view);
    expect(view.rsvp.current).toEqual({ answer: "yes", guestCount: 2, standing: "confirmed" });
    expect(view.rsvp.payment).toMatchObject({ amount: 105_000 });
    expect(view.rsvp.payerName).toBe("Aunt Dana");
    expect(view.rsvp.afterRsvpForm?.canSubmit).toEqual({ ok: true });
    expect(view.rsvp.afterRsvpForm?.prefill).toEqual({});
  });

  it("guest: no identity, so no row and no payment, but the same forms and the same after-RSVP form", async () => {
    const view = await getResponderView(orgId, await trip(), { kind: "guest" });
    expectOneShape(view);
    expect(view.identity).toEqual({ kind: "guest", guestEmail: "", guestName: "", rsvpAnswer: null });
    expect(view.rsvp.current).toBeNull();
    expect(view.rsvp.payment).toBeNull();
    expect(view.rsvp.payerName).toBeNull();
    expect(view.forms.map((item) => item.form.id)).toEqual([formId]);
    expect(view.rsvp.afterRsvpForm).toMatchObject({ form: { id: formId, title: "Dietary needs" }, required: true });
    // Everyone's answers count, whoever is looking.
    expect(view.counts.confirmedSeats).toBe(2 + 1 + 3);
  });

  describe("token door", () => {
    it("refuses an unknown link and another organization's link", async () => {
      expect(await resolveTokenResponder(orgId, "not-a-token-at-all-really", new Date())).toBeNull();
      expect(await resolveTokenResponder(otherOrgId, memberToken, new Date())).toBeNull();
    });

    it("a closed RSVP still resolves — the holder sees why", async () => {
      const afterDeadline = new Date(Date.now() + 20 * DAY);
      const resolved = await resolveTokenResponder(orgId, memberToken, afterDeadline);
      expect(resolved).not.toBeNull();
      const view = await getResponderView(orgId, resolved!, resolved!.responder, afterDeadline);
      expect(view.rsvp.open).toEqual({ open: false, reason: "deadline_passed" });
    });

    it("a draft event or an expired undated link is dead", async () => {
      await db.update(events).set({ status: "draft" }).where(eq(events.id, tripId));
      expect(await resolveTokenResponder(orgId, memberToken, new Date())).toBeNull();
      await db.update(events).set({ status: "published" }).where(eq(events.id, tripId));

      // Pure: the same predicate the pages and the actions share.
      expect(tokenLinkState({ open: false, reason: "token_expired" })).toBe("dead");
      expect(tokenLinkState({ open: false, reason: "event_deleted" })).toBe("dead");
      expect(tokenLinkState({ open: false, reason: "draft" })).toBe("dead");
      expect(tokenLinkState({ open: false, reason: "cancelled" })).toBe("closed");
      expect(tokenLinkState({ open: false, reason: "event_over" })).toBe("closed");
      expect(tokenLinkState({ open: true })).toBe("open");
    });

    it("a reissued link kills the old one", async () => {
      const fresh = await issueRsvpToken({ eventId: tripId, orgId, memberId: shadowId });
      expect(await resolveTokenResponder(orgId, memberToken, new Date())).toBeNull();
      expect((await resolveTokenResponder(orgId, fresh, new Date()))?.responder.memberId).toBe(shadowId);
      const rows = await db.select().from(eventRsvpTokens).where(eq(eventRsvpTokens.memberId, shadowId));
      expect(rows).toHaveLength(1);
    });
  });
});
