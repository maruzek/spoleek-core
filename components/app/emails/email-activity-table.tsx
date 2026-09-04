"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createColumnHelper } from "@tanstack/react-table";
import {
  ArrowUpRightIcon,
  EyeIcon,
  MailIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  getEmailKindLabel,
  getEmailStatusVariant,
  isInsideWindow,
  type EmailDateRange,
} from "@/components/app/emails/email-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { formatDateTime } from "@/lib/format";
import { resendMemberInviteAction } from "@/server/actions/member-admin";
import type { EmailActivityStatus, EmailKind } from "@/server/db/schema";
import type { EmailActivityRow } from "@/server/queries/email-activity";

const columnHelper = createColumnHelper<EmailActivityRow>();

export type EmailActivityScope = "organization" | "member";

/**
 * The email activity table, shared by the org dashboard and a member's Emails
 * tab. `scope` decides what is redundant: on a member's own page the "Related"
 * column and the "Open member" action point back at the page you are already
 * on, and the wide filter bar does not fit the narrower column.
 */
export function EmailActivityTable({
  activities,
  scope,
  onOpenDetail,
}: {
  activities: EmailActivityRow[];
  scope: EmailActivityScope;
  onOpenDetail: (activityId: string) => void;
}) {
  const router = useRouter();
  const isOrgScope = scope === "organization";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EmailActivityStatus>(
    "all",
  );
  const [kindFilter, setKindFilter] = useState<"all" | EmailKind>("all");
  const [problemFilter, setProblemFilter] = useState<"all" | "problems">("all");
  // A member's whole history is short enough to show at once; the org-wide
  // dashboard needs a default window or it opens on thousands of rows.
  const [dateRange, setDateRange] = useState<EmailDateRange>(
    isOrgScope ? "30d" : "all",
  );

  const resendInviteAction = useAction(resendMemberInviteAction, {
    onSuccess({ data }) {
      if (!data) {
        return;
      }

      if (data.sent) {
        toast.success("Activation email sent.");
        router.refresh();
        return;
      }

      const message =
        data.reason === "cooldown"
          ? "Invite resend is cooling down. Wait a few minutes before trying again."
          : data.reason === "already-completed"
            ? "This member already completed account activation."
            : data.reason === "already-active"
              ? "This member is already linked and does not need another invite."
              : data.reason === "suppressed"
                ? "Email delivery is blocked for this address due to a bounce, complaint, or suppression."
                : "The current activation email is still valid, so a new one was not sent.";

      toast.error(message);
      router.refresh();
    },
  });

  /** Every email type actually present, so the filter never offers dead options. */
  const availableKinds = useMemo(
    () => [...new Set(activities.map((activity) => activity.kind))].sort(),
    [activities],
  );

  const filteredActivities = useMemo(
    () =>
      activities.filter((activity) => {
        if (
          search.trim().length > 0 &&
          !activity.search.toLowerCase().includes(search.trim().toLowerCase())
        ) {
          return false;
        }

        if (statusFilter !== "all" && activity.currentStatus !== statusFilter) {
          return false;
        }

        if (kindFilter !== "all" && activity.kind !== kindFilter) {
          return false;
        }

        if (problemFilter === "problems" && !activity.hasProblem) {
          return false;
        }

        return isInsideWindow(activity.sentAt ?? activity.createdAt, dateRange);
      }),
    [activities, dateRange, kindFilter, problemFilter, search, statusFilter],
  );

  const columns = useMemo(() => {
    const base = [
      columnHelper.accessor("search", {
        id: "recipient",
        header: isOrgScope ? "Recipient" : "Email",
        meta: { label: "Recipient" },
        cell: ({ row }) => {
          const activity = row.original;

          return (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-medium text-foreground">
                {isOrgScope
                  ? activity.toName || activity.memberName || activity.toEmail
                  : activity.subject}
              </span>
              <span className="truncate text-sm text-muted-foreground">
                {activity.toEmail}
              </span>
            </div>
          );
        },
      }),
      columnHelper.accessor("kind", {
        header: "Type",
        meta: { label: "Type" },
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <Badge variant="secondary" className="w-fit">
              {getEmailKindLabel(row.original.kind)}
            </Badge>
            {isOrgScope && row.original.subject ? (
              <span className="max-w-xs truncate text-xs text-muted-foreground">
                {row.original.subject}
              </span>
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor("currentStatus", {
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => (
          <Status variant={getEmailStatusVariant(row.original.currentStatus)}>
            <StatusIndicator />
            <StatusLabel className="capitalize">
              {row.original.currentStatus.replaceAll("_", " ")}
            </StatusLabel>
          </Status>
        ),
      }),
    ];

    const relatedColumn = columnHelper.accessor("memberName", {
      header: "Related",
      meta: { label: "Related" },
      cell: ({ row }) => {
        const activity = row.original;

        if (!activity.memberId) {
          return <span className="text-muted-foreground">No linked member</span>;
        }

        return (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-foreground">
              {activity.memberName || "Member"}
            </span>
            <span className="text-xs capitalize text-muted-foreground">
              {activity.memberStatus?.replaceAll("_", " ") || "Unknown status"}
            </span>
          </div>
        );
      },
    });

    const trailing = [
      columnHelper.accessor("lastStatusAt", {
        header: "Last update",
        meta: { label: "Last update" },
        cell: ({ row }) => (
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <span>{formatDateTime(row.original.lastStatusAt)}</span>
            {row.original.sentAt ? (
              <span className="text-xs">
                Sent {formatDateTime(row.original.sentAt)}
              </span>
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor("lastError", {
        header: "Problem",
        meta: { label: "Problem" },
        cell: ({ row }) =>
          row.original.lastError ? (
            <div className="flex max-w-sm items-start gap-2 text-sm text-destructive">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              <span>{row.original.lastError}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">No problem recorded</span>
          ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        meta: { label: "Actions" },
        cell: ({ row }) => {
          const activity = row.original;

          return (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpenDetail(activity.id)}
              >
                <EyeIcon data-icon="inline-start" />
                Details
              </Button>
              {isOrgScope && activity.memberId ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/admin/members/${activity.memberId}`}>
                    <ArrowUpRightIcon data-icon="inline-start" />
                    Open member
                  </Link>
                </Button>
              ) : null}
              {activity.canResend && activity.memberId ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resendInviteAction.isPending}
                  onClick={() => {
                    void resendInviteAction.executeAsync({
                      memberId: activity.memberId!,
                    });
                  }}
                >
                  <MailIcon data-icon="inline-start" />
                  Resend invite
                </Button>
              ) : null}
            </div>
          );
        },
      }),
    ];

    return isOrgScope
      ? [...base, relatedColumn, ...trailing]
      : [...base, ...trailing];
  }, [isOrgScope, onOpenDetail, resendInviteAction]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="w-full lg:max-w-sm">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              isOrgScope
                ? "Search recipient, member, subject, or provider id..."
                : "Search subject, address, or provider id..."
            }
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as "all" | EmailActivityStatus)
          }
        >
          <SelectTrigger className="w-full lg:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="bounced">Bounced</SelectItem>
            <SelectItem value="complained">Complained</SelectItem>
            <SelectItem value="suppressed">Suppressed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        {availableKinds.length > 1 ? (
          <Select
            value={kindFilter}
            onValueChange={(value) => setKindFilter(value as "all" | EmailKind)}
          >
            <SelectTrigger className="w-full lg:w-[220px]">
              <SelectValue placeholder="Email type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All email types</SelectItem>
              {availableKinds.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {getEmailKindLabel(kind)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select
          value={problemFilter}
          onValueChange={(value) =>
            setProblemFilter(value as "all" | "problems")
          }
        >
          <SelectTrigger className="w-full lg:w-[180px]">
            <SelectValue placeholder="Problem filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All records</SelectItem>
            <SelectItem value="problems">Problems only</SelectItem>
          </SelectContent>
        </Select>

        {isOrgScope ? (
          <Select
            value={dateRange}
            onValueChange={(value) => setDateRange(value as EmailDateRange)}
          >
            <SelectTrigger className="w-full lg:w-[180px]">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <DataTable
        data={filteredActivities}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        emptyStateTitle="No matching emails"
        emptyStateDescription="Adjust the filters above to widen the search."
        onRowClick={(activity) => onOpenDetail(activity.id)}
      />
    </div>
  );
}
