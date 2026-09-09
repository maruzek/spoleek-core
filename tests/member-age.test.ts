import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/server/db";
import {
  memberCustomFieldValues,
  memberCustomFields,
  organizations,
  tenantMembers,
} from "@/server/db/schema";
import {
  getAgeFromDateOfBirth,
  getMemberAgeSignal,
  resolveEligibility,
} from "@/server/lib/member-age";

/**
 * The organization's minimum age flags an application for a human; it never
 * rejects one. A youth organization wants the young applicant to reach someone
 * who can take a guardian countersignature, not to be turned away by a form.
 */
describe("reading an age from a stored date", () => {
  const now = new Date("2026-09-07T12:00:00Z");

  it("counts whole years, not calendar years", () => {
    // Birthday not yet reached this year.
    expect(getAgeFromDateOfBirth("2010-12-31", now)).toBe(15);
    expect(getAgeFromDateOfBirth("2010-01-01", now)).toBe(16);
  });

  it("treats anything unusable as unknown rather than zero", () => {
    expect(getAgeFromDateOfBirth(null, now)).toBeNull();
    expect(getAgeFromDateOfBirth("", now)).toBeNull();
    expect(getAgeFromDateOfBirth("not-a-date", now)).toBeNull();
    expect(getAgeFromDateOfBirth(42, now)).toBeNull();
    // Data entry gone wrong, not a negative age.
    expect(getAgeFromDateOfBirth("2030-01-01", now)).toBeNull();
  });
});

const canReachDb = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

const suite = canReachDb ? describe : describe.skip;

suite("the under-age signal", () => {
  let orgId: string;
  let fieldId: string;

  async function makeMemberWithBirthDate(value: string | null) {
    const [member] = await db
      .insert(tenantMembers)
      .values({
        orgId,
        firstName: "Age",
        lastName: "Testcase",
        status: "pending",
      })
      .returning({ id: tenantMembers.id });

    if (value !== null) {
      await db.insert(memberCustomFieldValues).values({
        orgId,
        memberId: member.id,
        fieldId,
        value,
      });
    }

    return member.id;
  }

  async function setMinimumAge(minimumAge: number | null) {
    await db
      .update(organizations)
      .set({ registrationMinimumAge: minimumAge })
      .where(eq(organizations.id, orgId));
  }

  beforeAll(async () => {
    const [organization] = await db
      .insert(organizations)
      .values({ slug: `age-test-${Date.now()}`, name: "Age test org" })
      .returning({ id: organizations.id });

    orgId = organization.id;

    const [field] = await db
      .insert(memberCustomFields)
      .values({
        orgId,
        key: "date_of_birth",
        label: "Date of birth",
        type: "date",
        stage: "registration",
        isDateOfBirth: true,
      })
      .returning({ id: memberCustomFields.id });

    fieldId = field.id;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await pool.end();
  });

  it("says nothing when the organization set no minimum age", async () => {
    await setMinimumAge(null);
    const memberId = await makeMemberWithBirthDate("2015-01-01");

    // Not "old enough" — "we were not asked to check".
    expect(await getMemberAgeSignal({ orgId, memberId })).toBeNull();
  });

  it("flags an applicant below the minimum", async () => {
    await setMinimumAge(15);
    const memberId = await makeMemberWithBirthDate("2015-01-01");

    const signal = await getMemberAgeSignal({
      orgId,
      memberId,
      now: new Date("2026-09-07T12:00:00Z"),
    });

    expect(signal).toMatchObject({ age: 11, minimumAge: 15, isUnderAge: true });
  });

  it("clears an applicant at or above the minimum", async () => {
    await setMinimumAge(15);
    const memberId = await makeMemberWithBirthDate("2000-01-01");

    const signal = await getMemberAgeSignal({
      orgId,
      memberId,
      now: new Date("2026-09-07T12:00:00Z"),
    });

    expect(signal?.isUnderAge).toBe(false);
  });

  it("flags a missing birth date rather than passing it silently", async () => {
    await setMinimumAge(15);
    const memberId = await makeMemberWithBirthDate(null);

    const signal = await getMemberAgeSignal({ orgId, memberId });

    expect(signal).toMatchObject({ age: null, isUnderAge: true });
  });

  it("says nothing when no field is marked as the date of birth", async () => {
    await setMinimumAge(15);
    const memberId = await makeMemberWithBirthDate("2015-01-01");

    await db
      .update(memberCustomFields)
      .set({ isDateOfBirth: false })
      .where(eq(memberCustomFields.id, fieldId));

    expect(await getMemberAgeSignal({ orgId, memberId })).toBeNull();

    await db
      .update(memberCustomFields)
      .set({ isDateOfBirth: true })
      .where(eq(memberCustomFields.id, fieldId));
  });
});

/**
 * Aging out differs from the under-age check in kind, not just direction.
 * Under the minimum is a flag for a human; past the maximum is a fact about
 * the membership, and it stops money going out.
 *
 * `endsAtAge` is the age at which membership ends, not the last age somebody
 * may be. TOP tym's rule — "membership ends on the 36th birthday, so 35 is the
 * last year you are a member" — is `endsAtAge: 36`. Naming it "maximum age"
 * cost a whole year of membership in the first version of this.
 */
describe("the age at which membership ends", () => {
  const dob = "1991-06-15";

  it("ends membership on that birthday itself, not the day after", () => {
    const dayBefore = resolveEligibility({
      dateOfBirth: dob,
      endsAtAge: 36,
      effect: "birthday",
      now: new Date("2027-06-14T12:00:00Z"),
    });
    const onTheDay = resolveEligibility({
      dateOfBirth: dob,
      endsAtAge: 36,
      effect: "birthday",
      now: new Date("2027-06-15T00:00:00Z"),
    });

    expect(dayBefore.hasAgedOut).toBe(false);
    expect(onTheDay.hasAgedOut).toBe(true);
    // Last day in is the day before the birthday.
    expect(dayBefore.membershipEndsOn?.toISOString().slice(0, 10)).toBe(
      "2027-06-14",
    );
  });

  it("keeps a 35-year-old, which is the point of the rule", () => {
    const result = resolveEligibility({
      dateOfBirth: dob,
      endsAtAge: 36,
      effect: "birthday",
      now: new Date("2027-01-01T12:00:00Z"),
    });

    expect(result.age).toBe(35);
    expect(result.hasAgedOut).toBe(false);
  });

  it("carries them through the whole final day under period_end", () => {
    const lastDay = resolveEligibility({
      dateOfBirth: dob,
      endsAtAge: 36,
      effect: "period_end",
      now: new Date("2027-12-31T23:00:00Z"),
    });
    const nextDay = resolveEligibility({
      dateOfBirth: dob,
      endsAtAge: 36,
      effect: "period_end",
      now: new Date("2028-01-01T00:00:00Z"),
    });

    expect(lastDay.hasAgedOut).toBe(false);
    expect(lastDay.membershipEndsOn?.toISOString().slice(0, 10)).toBe(
      "2027-12-31",
    );
    expect(nextDay.hasAgedOut).toBe(true);
  });

  it("never ages somebody out on a birth date it does not have", () => {
    // The opposite of the minimum-age rule, and deliberately so: ending a
    // membership, stopping a fee and dropping somebody off the roster on the
    // strength of missing data is worse than keeping them a member.
    const result = resolveEligibility({
      dateOfBirth: null,
      endsAtAge: 36,
      effect: "period_end",
    });

    expect(result.hasAgedOut).toBe(false);
    expect(result.age).toBeNull();
  });

  it("leaves a member well inside the window alone", () => {
    const result = resolveEligibility({
      dateOfBirth: "2004-01-01",
      endsAtAge: 36,
      effect: "period_end",
      now: new Date("2026-09-09T00:00:00Z"),
    });

    expect(result.hasAgedOut).toBe(false);
    expect(result.age).toBe(22);
  });
});
