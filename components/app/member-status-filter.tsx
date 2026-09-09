"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectGroup,
  MultiSelectItem,
  MultiSelectTrigger,
  MultiSelectValue,
} from "@/components/ui/multi-select";
import { cn } from "@/lib/utils";
import {
  MEMBER_STATUS_OPTIONS,
  serializeMemberStatusFilter,
} from "@/lib/member-status-display";
import type { MembershipStatus } from "@/server/db/schema";

/**
 * The members table's status filter.
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
    <MultiSelect
      multiple
      items={MEMBER_STATUS_OPTIONS}
      value={value}
      onValueChange={(next) => handleChange(next as MembershipStatus[])}
    >
      <MultiSelectTrigger
        className="min-w-44"
        data-pending={isPending ? "" : undefined}
        aria-label="Filter by status"
      >
        <MultiSelectValue>
          {(selected: MembershipStatus[]) => (
            <div className="flex min-w-0 items-center gap-2">
              {/* Overlapping dots rather than a list of names: the trigger has
                  to stay one line at six statuses, and the colours are already
                  how the Status column reads. */}
              <div className="flex -space-x-1 overflow-hidden">
                {MEMBER_STATUS_OPTIONS.filter((option) =>
                  selected.includes(option.value),
                ).map((option) => (
                  <span
                    key={option.value}
                    className={cn(
                      "size-2.5 shrink-0 rounded-full ring-2 ring-background",
                      option.dotClassName,
                    )}
                  />
                ))}
              </div>
              <span className="truncate">Status</span>
              <Badge variant="outline" className="ml-0.5">
                {selected.length}/{MEMBER_STATUS_OPTIONS.length}
              </Badge>
            </div>
          )}
        </MultiSelectValue>
      </MultiSelectTrigger>
      <MultiSelectContent>
        <MultiSelectGroup>
          {MEMBER_STATUS_OPTIONS.map((option) => (
            <MultiSelectItem key={option.value} value={option.value}>
              <span
                className={cn("size-2 shrink-0 rounded-full", option.dotClassName)}
              />
              <span>{option.label}</span>
            </MultiSelectItem>
          ))}
        </MultiSelectGroup>
      </MultiSelectContent>
    </MultiSelect>
  );
}
