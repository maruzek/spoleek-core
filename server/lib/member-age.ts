import { differenceInYears, isValid, parseISO } from "date-fns";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  memberCustomFieldValues,
  memberCustomFields,
  organizations,
} from "@/server/db/schema";

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
