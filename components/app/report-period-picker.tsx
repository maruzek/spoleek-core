"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { ReportPeriodOption } from "@/server/queries/membership-reports";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Year picker for the report views.
 *
 * The choice lives in the URL rather than in component state so a board member
 * can send someone a link to a specific year — which is most of the reason for
 * keeping old reports at all.
 */
export function ReportPeriodPicker({
  periods,
  currentReportId,
}: {
  periods: ReportPeriodOption[];
  currentReportId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (periods.length < 2) return null;

  // No status badge, in the list or on the trigger: the picker picks a year.
  // Whether that year is still open is a property of the report being looked
  // at, and the page it sits on says so where it matters.
  return (
    <Select
      value={currentReportId}
      onValueChange={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("report", value);
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }}
    >
      <SelectTrigger className="w-[140px]" aria-label="Membership year">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {periods.map((period) => (
          <SelectItem key={period.id} value={period.id}>
            {period.periodLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
