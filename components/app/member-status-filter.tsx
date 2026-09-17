"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { StatusFilter } from "@/components/app/status-filter";
import {
  MEMBER_STATUS_OPTIONS,
  serializeMemberStatusFilter,
} from "@/lib/member-status-display";
import type { MembershipStatus } from "@/server/db/schema";

/**
 * The members table's status filter: the generic `StatusFilter` plus URL sync.
 *
 * Every status except `deleted` is selected by default; ticking `deleted` is
 * how an admin reaches soft-deleted members, and unticking the rest is how they
 * see only those. That is one control instead of a filter plus a separate
 * "show deleted" mode, and it is the same gesture for every other combination.
 *
 * The selection lives in the URL rather than in component state, for a reason
 * that is easy to miss: **deleted members are not in the table's data at all.**
 * `listTenantMembers` omits them unless the server was asked to include them,
 * so a purely client-side filter could never reveal one. Writing the selection
 * to `?status=` lets the server page decide what to fetch, and has the pleasant
 * side effect of making "the deleted members list" a linkable thing.
 *
 * Everything except toggling `deleted` is therefore instant (a client-side
 * column filter over data already loaded); toggling `deleted` costs a
 * navigation, which `useTransition` reports so the trigger can show it.
 */
export function MemberStatusFilter({
  value,
  onChange,
}: {
  value: MembershipStatus[];
  /** Applies the selection to the table. The URL is this component's business. */
  onChange: (statuses: MembershipStatus[]) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleChange = (next: MembershipStatus[]) => {
    onChange(next);

    const params = new URLSearchParams(searchParams.toString());
    const serialized = serializeMemberStatusFilter(next);

    if (serialized == null) {
      params.delete("status");
    } else {
      params.set("status", serialized);
    }

    const query = params.toString();

    // `scroll: false` because this is a filter, not a navigation — jumping to
    // the top of the page on every tick would be hostile.
    startTransition(() => {
      router.replace(query.length > 0 ? `?${query}` : "?", { scroll: false });
    });
  };

  return (
    <StatusFilter
      options={MEMBER_STATUS_OPTIONS}
      value={value}
      onChange={handleChange}
      isPending={isPending}
    />
  );
}
