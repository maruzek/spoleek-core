/**
 * Portal dashboard model — the member's own briefing.
 *
 * Same three questions as the admin dashboard, asked of one person:
 *
 *   1. What do I need to do?     → `PortalTodo`
 *   2. What is coming up for me? → `PortalUpcoming`
 *   3. Where do I stand?         → `MembershipSummary`
 *
 * And, because the portal is where a member finishes the profile the
 * organization asked for, one `ProfileCompleteness` that the overview tile and
 * the profile page both read — so "3 details missing" means the same thing
 * on both.
 */

import type { MemberCustomField } from "@/server/db/schema";

export type PortalArea = "profile" | "groups" | "events" | "forms" | "payments";

export const PORTAL_AREA_ORDER: PortalArea[] = ["profile", "groups", "events", "forms", "payments"];

export type PortalTodoKind =
  | "profile_required"
  | "profile_optional"
  | "payment_overdue"
  | "payment_due"
  | "refund_due"
  | "rsvp_needed"
  | "form_pending";

export type PortalTodo = {
  id: string;
  area: PortalArea;
  kind: PortalTodoKind;
  title: string;
  detail: string;
  href: string;
  /** A hard date this is due by, when there is one. */
  dueAt: Date | null;
  urgent?: "error" | "warning" | null;
};

export type PortalUpcomingKind = "event" | "rsvp_deadline" | "payment_due" | "form_closes";

export type PortalUpcoming = {
  id: string;
  area: PortalArea;
  kind: PortalUpcomingKind;
  at: Date;
  title: string;
  detail: string;
  href: string;
  /** Present when the member already answered — the row can say "going". */
  answer?: "yes" | "no" | "maybe" | null;
};

export type MembershipSummary = {
  status: "invited" | "pending" | "active" | "suspended" | "archived" | "deleted";
  role: "member" | "leader" | "org_admin";
  memberSince: Date | null;
  /** The address the organization writes to, after preference resolution. */
  contactEmail: string | null;
  groups: { id: string; name: string; categoryName: string; isAdmin: boolean }[];
  /** Join requests the member has sent that no leader has decided yet. */
  pendingRequests: number;
  /** The current period's fee, when fees are on: paid, due, or nothing issued. */
  fee: { label: string; status: "paid" | "pending" | "overdue" | "none" } | null;
};

export type PortalTile = {
  key: PortalArea;
  title: string;
  href: string;
  stat: { value: string; label: string } | null;
  alerts: number;
};

export type PortalDashboardData = {
  now: Date;
  todos: PortalTodo[];
  upcoming: PortalUpcoming[];
  membership: MembershipSummary;
  completeness: ProfileCompleteness;
  tiles: PortalTile[];
};

// ─── Profile completeness ───────────────────────────────────────────────────

export type ProfileCompleteness = {
  /** Every field the member is asked about, required or not. */
  total: number;
  filled: number;
  /** 0–100, over `total`. 100 when there is nothing to fill. */
  percent: number;
  missingRequired: { key: string; label: string }[];
  missingOptional: { key: string; label: string }[];
};

type CompletenessField = Pick<MemberCustomField, "key" | "label" | "type" | "required">;

/** Whether an answer counts as given. Mirrors `getPostApprovalCompleteness`. */
export function isCustomFieldAnswered(field: Pick<MemberCustomField, "type">, value: unknown) {
  if (field.type === "boolean") return value === true;
  if (Array.isArray(value)) return value.length > 0;
  return value != null && String(value).trim().length > 0;
}

export function profileCompleteness(
  fields: readonly CompletenessField[],
  answers: Record<string, unknown>,
): ProfileCompleteness {
  const missingRequired: ProfileCompleteness["missingRequired"] = [];
  const missingOptional: ProfileCompleteness["missingOptional"] = [];
  let filled = 0;

  for (const field of fields) {
    if (isCustomFieldAnswered(field, answers[field.key])) {
      filled += 1;
    } else {
      (field.required ? missingRequired : missingOptional).push({ key: field.key, label: field.label });
    }
  }

  const total = fields.length;
  return {
    total,
    filled,
    percent: total === 0 ? 100 : Math.round((filled / total) * 100),
    missingRequired,
    missingOptional,
  };
}

// ─── Ordering ───────────────────────────────────────────────────────────────

const TODO_KIND_RANK: Record<PortalTodoKind, number> = {
  profile_required: 0,
  payment_overdue: 1,
  rsvp_needed: 2,
  form_pending: 3,
  payment_due: 4,
  refund_due: 5,
  profile_optional: 6,
};

/**
 * What the member sees first. A profile the organization is still waiting on
 * comes before everything — it is the one thing that can lock them out — then
 * money already late, then anything with a deadline, soonest first.
 */
export function rankTodos(items: readonly PortalTodo[]): PortalTodo[] {
  return [...items].sort(
    (a, b) =>
      TODO_KIND_RANK[a.kind] - TODO_KIND_RANK[b.kind] ||
      (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity),
  );
}

export function sortByDate<T extends { at: Date; title: string }>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || a.title.localeCompare(b.title),
  );
}
