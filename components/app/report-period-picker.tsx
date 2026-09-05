"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { ReportPeriodOption } from "@/server/queries/membership-reports";
import { Badge } from "@/components/ui/badge";
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

  return (
    <Select
      value={currentReportId}
      onValueChange={(value) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("report", value);
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }}
    >
      <SelectTrigger className="w-[180px]" aria-label="Membership year">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {periods.map((period) => (
          <SelectItem key={period.id} value={period.id}>
            <span className="flex items-center gap-2">
              {period.periodLabel}
              {period.status === "open" ? (
                <Badge variant="secondary">Open</Badge>
              ) : period.status === "closed" ? (
                <Badge variant="outline">Closed</Badge>
              ) : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
