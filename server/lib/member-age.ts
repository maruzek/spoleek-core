import { differenceInYears, isValid, parseISO } from "date-fns";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  memberCustomFieldValues,
  memberCustomFields,
  organizations,
} from "@/server/db/schema";
import type { MaximumAgeEffect } from "@/server/db/schema";

/**
 * Whether an applicant is below the organization's minimum age.
 *
 * A youth organization's minimum age comes from its stanovy, not from the
 * Regulation — Art. 8's consent threshold largely does not bite when the
 * register runs on a contract basis. What the organization owes is a human
 * looking at the application and, for the youngest members, a guardian
 * countersignature. So this flags; it never rejects.
 *
 * That is also why the signal is derived on read rather than stamped onto
 * `tenant_members` at registration: an admin correcting a mistyped birth date,
 * or the board lowering the minimum age, should change the answer everywhere at
 * once instead of leaving a stale boolean behind.
 */
export type MemberAgeSignal = {
  /** Null when no date of birth has been recorded for this member. */
  age: number | null;
  minimumAge: number;
  isUnderAge: boolean;
};

/** The one field an organization has marked as holding the date of birth. */
async function getDateOfBirthFieldId(orgId: string) {
  const [field] = await db
    .select({ id: memberCustomFields.id })
    .from(memberCustomFields)
    .where(
      and(
        eq(memberCustomFields.orgId, orgId),
        eq(memberCustomFields.isDateOfBirth, true),
        eq(memberCustomFields.isActive, true),
      ),
    )
    .limit(1);

  return field?.id ?? null;
}

export function getAgeFromDateOfBirth(value: unknown, now = new Date()): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = parseISO(value);

  if (!isValid(parsed)) {
    return null;
  }

  const age = differenceInYears(now, parsed);

  // A birth date in the future is data entry gone wrong, not a negative age.
  return age >= 0 ? age : null;
}

/**
 * Null when the organization has set no minimum age, or has not marked which
 * field holds the date of birth. Both mean "this organization has not asked us
 * to watch for this", which is different from "this applicant is old enough" —
 * so callers render nothing rather than an all-clear.
 */
export async function getMemberAgeSignal({
  orgId,
  memberId,
  now = new Date(),
}: {
  orgId: string;
  memberId: string;
  now?: Date;
}): Promise<MemberAgeSignal | null> {
  const [organization] = await db
    .select({ minimumAge: organizations.registrationMinimumAge })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const minimumAge = organization?.minimumAge;

  if (minimumAge == null) {
    return null;
  }

  const fieldId = await getDateOfBirthFieldId(orgId);

  if (!fieldId) {
    return null;
  }

  const [row] = await db
    .select({ value: memberCustomFieldValues.value })
    .from(memberCustomFieldValues)
    .where(
      and(
        eq(memberCustomFieldValues.memberId, memberId),
        eq(memberCustomFieldValues.fieldId, fieldId),
      ),
    )
    .limit(1);

  const age = getAgeFromDateOfBirth(row?.value, now);

  return {
    age,
    minimumAge,
    // A missing birth date is not "old enough". The organization asked to be
    // told about under-age applicants and cannot be, so the admin is shown the
    // gap rather than a silent pass.
    isUnderAge: age == null || age < minimumAge,
  };
}

/**
 * Whether a member has passed the organization's maximum age.
 *
 * Distinct from the under-age signal above in kind, not just in direction.
 * Being under the minimum is a *flag for review* — a human decides, and a
 * guardian may countersign. Being over the maximum is a *fact*: the membership
 * relationship the stanovy define has ended, and with it the Art. 6(1)(b) basis
 * for processing that person as an active member. What survives is the narrower
 * obligation to keep a register of former members, which Art. 9(2)(d) covers
 * explicitly.
 *
 * Returns null when the organization set no maximum — "we were not asked to
 * check", which is not the same claim as "this member is still eligible".
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export type MemberEligibility = {
  age: number | null;
  endsAtAge: number;
  /** True once they are past the limit, per the organization's chosen effect. */
  hasAgedOut: boolean;
  /**
   * The last day they are a member. Null when there is no birth date to
   * compute from. Kept as "last day in" rather than "first day out" because it
   * is what an admin and a member are told.
   */
  membershipEndsOn: Date | null;
};

export async function getMemberEligibility({
  orgId,
  memberId,
  now = new Date(),
}: {
  orgId: string;
  memberId: string;
  now?: Date;
}): Promise<MemberEligibility | null> {
  const [organization] = await db
    .select({
      endsAtAge: organizations.membershipEndsAtAge,
      effect: organizations.maximumAgeEffect,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const endsAtAge = organization?.endsAtAge;

  if (endsAtAge == null) {
    return null;
  }

  const fieldId = await getDateOfBirthFieldId(orgId);

  if (!fieldId) {
    return null;
  }

  const [row] = await db
    .select({ value: memberCustomFieldValues.value })
    .from(memberCustomFieldValues)
    .where(
      and(
        eq(memberCustomFieldValues.memberId, memberId),
        eq(memberCustomFieldValues.fieldId, fieldId),
      ),
    )
    .limit(1);

  return resolveEligibility({
    dateOfBirth: row?.value,
    endsAtAge,
    effect: organization.effect,
    now,
  });
}

/**
 * The rule itself, separated from the fetching so it can be reasoned about and
 * tested without a database — and reused by the fee generator, which already
 * holds every member's birth date in memory.
 *
 * A **missing birth date is not an ageing-out**. Unlike the minimum-age check,
 * where an unknown age is treated as under-age so somebody looks at it, here
 * the cautious answer is the opposite: ending a membership, cancelling a fee
 * and dropping someone off the roster on the strength of data you do not have
 * is a worse error than keeping them a member.
 */
export function resolveEligibility({
  dateOfBirth,
  endsAtAge,
  effect,
  now = new Date(),
}: {
  dateOfBirth: unknown;
  endsAtAge: number;
  effect: MaximumAgeEffect;
  now?: Date;
}): MemberEligibility {
  const age = getAgeFromDateOfBirth(dateOfBirth, now);

  if (age == null) {
    return { age: null, endsAtAge, hasAgedOut: false, membershipEndsOn: null };
  }

  // Read straight off the stored "YYYY-MM-DD" rather than through `parseISO`,
  // which gives *local* midnight for a date-only string — in Prague that is
  // 22:00Z the previous day, so the UTC getters would shift every birthday one
  // day earlier and end memberships a day early. Same UTC discipline as
  // `lib/membership-period.ts`.
  const [year, month, day] = String(dateOfBirth).split("-").map(Number);

  if (!year || !month || !day) {
    return { age, endsAtAge, hasAgedOut: false, membershipEndsOn: null };
  }

  // The birthday on which the limit is reached. "Ends at age 36" means this
  // day is the first day they are not a member — hence `>=` below, not `>`.
  const limitBirthday = Date.UTC(year + endsAtAge, month - 1, day);

  if (effect === "birthday") {
    return {
      age,
      endsAtAge,
      hasAgedOut: now.getTime() >= limitBirthday,
      // Last day in: the day before that birthday.
      membershipEndsOn: new Date(limitBirthday - DAY_MS),
    };
  }

  // `period_end` carries them to the end of the period in which the limit is
  // reached, which is what statutes normally say and what makes the yearly
  // report fall out correctly: they count in that period and not in the next.
  const lastDay = Date.UTC(year + endsAtAge, 11, 31);

  return {
    age,
    endsAtAge,
    // Still a member for the whole of 31 December.
    hasAgedOut: now.getTime() >= lastDay + DAY_MS,
    membershipEndsOn: new Date(lastDay),
  };
}

/**
 * Members of an organization who have passed its maximum age.
 *
 * A set rather than a per-member call, because the callers that need it — fee
 * generation, renewal reminders — are batch jobs iterating the whole roster,
 * and asking one member at a time would turn one query into several hundred.
 *
 * Empty when the organization set no maximum, or marked no date-of-birth
 * field. Both mean the same thing operationally: nobody is excluded.
 */
export async function listAgedOutMemberIds(
  orgId: string,
  now = new Date(),
): Promise<Set<string>> {
  const [organization] = await db
    .select({
      endsAtAge: organizations.membershipEndsAtAge,
      effect: organizations.maximumAgeEffect,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const endsAtAge = organization?.endsAtAge;

  if (endsAtAge == null) {
    return new Set();
  }

  const fieldId = await getDateOfBirthFieldId(orgId);

  if (!fieldId) {
    return new Set();
  }

  const rows = await db
    .select({
      memberId: memberCustomFieldValues.memberId,
      value: memberCustomFieldValues.value,
    })
    .from(memberCustomFieldValues)
    .where(
      and(
        eq(memberCustomFieldValues.orgId, orgId),
        eq(memberCustomFieldValues.fieldId, fieldId),
      ),
    );

  const agedOut = new Set<string>();

  for (const row of rows) {
    const eligibility = resolveEligibility({
      dateOfBirth: row.value,
      endsAtAge,
      effect: organization.effect,
      now,
    });

    if (eligibility.hasAgedOut) {
      agedOut.add(row.memberId);
    }
  }

  return agedOut;
}
