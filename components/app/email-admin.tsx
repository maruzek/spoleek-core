"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createColumnHelper } from "@tanstack/react-table";
import {
  ArrowUpRightIcon,
  EyeIcon,
  MailIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";

import { resendMemberInviteAction } from "@/server/actions/member-admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineDot,
  TimelineHeader,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from "@/components/ui/timeline";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type EmailActivityRow = {
  id: string;
  direction: "outbound" | "inbound";
  kind: "member_activation_invite";
  currentStatus:
    | "sent"
    | "delivered"
    | "bounced"
    | "complained"
    | "suppressed"
    | "failed";
  memberId: string | null;
  inviteId: string | null;
  resendOfEmailActivityId: string | null;
  providerEmailId: string | null;
  fromEmail: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  providerEventType: string | null;
  lastError: string | null;
  problemAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
  suppressedAt: Date | null;
  failedAt: Date | null;
  lastStatusAt: Date;
  createdAt: Date;
  memberFirstName: string | null;
  memberLastName: string | null;
  memberStatus: string | null;
  memberUserId: string | null;
  memberLinkedAt: Date | null;
  inviteStatus: string | null;
  inviteDeliveryStatus: string | null;
  inviteResendAvailableAt: Date | null;
  memberName: string | null;
  search: string;
  hasProblem: boolean;
  canResend: boolean;
  resendDisabledReason: string | null;
};

type EmailActivityDetail = {
  id: string;
  direction: "outbound" | "inbound";
  kind: "member_activation_invite";
  currentStatus:
    | "sent"
    | "delivered"
    | "bounced"
    | "complained"
    | "suppressed"
    | "failed";
  memberId: string | null;
  inviteId: string | null;
  resendOfEmailActivityId: string | null;
  actorUserId: string | null;
  providerEmailId: string | null;
  fromEmail: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  providerEventType: string | null;
  lastError: string | null;
  problemAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
  suppressedAt: Date | null;
  failedAt: Date | null;
  lastStatusAt: Date;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  memberFirstName: string | null;
  memberLastName: string | null;
  memberStatus: string | null;
  memberUserId: string | null;
  memberLinkedAt: Date | null;
  inviteStatus: string | null;
  inviteDeliveryStatus: string | null;
  inviteResendAvailableAt: Date | null;
  inviteSentAt: Date | null;
  inviteCompletedAt: Date | null;
  memberName: string | null;
  canResend: boolean;
  resendDisabledReason: string | null;
  events: Array<{
    id: string;
    eventType:
      | "api_accepted"
      | "resend_requested"
      | "sent"
      | "delivered"
      | "bounced"
      | "complained"
      | "suppressed"
      | "failed";
    providerEventType: string | null;
    message: string | null;
    metadata: Record<string, unknown> | null;
    occurredAt: Date;
  }>;
};

const columnHelper = createColumnHelper<EmailActivityRow>();

function getStatusVariant(
  status: EmailActivityRow["currentStatus"] | EmailActivityDetail["currentStatus"],
) {
  if (status === "delivered") {
    return "success";
  }

  if (status === "bounced" || status === "complained" || status === "suppressed" || status === "failed") {
    return "error";
  }

  return "info";
}

function getKindLabel(kind: EmailActivityRow["kind"] | EmailActivityDetail["kind"]) {
  if (kind === "member_activation_invite") {
    return "Member activation invite";
  }

  return String(kind).replaceAll("_", " ");
}

function isInsideWindow(date: Date | null, range: "7d" | "30d" | "90d" | "all") {
  if (!date || range === "all") {
    return true;
  }

  const now = Date.now();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return now - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

export function EmailAdmin({
  activities,
  selectedActivity,
}: {
  activities: EmailActivityRow[];
  selectedActivity: EmailActivityDetail | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | EmailActivityRow["currentStatus"]
  >("all");
  const [kindFilter, setKindFilter] = useState<"all" | EmailActivityRow["kind"]>("all");
  const [problemFilter, setProblemFilter] = useState<"all" | "problems">("all");
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all">("30d");

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

  const updateSearchParam = (emailId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());

    if (emailId) {
      params.set("email", emailId);
    } else {
      params.delete("email");
    }

    const nextUrl =
      params.toString().length > 0 ? `${pathname}?${params}` : pathname;
    router.replace(nextUrl, { scroll: false });
  };

  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
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
    });
  }, [activities, dateRange, kindFilter, problemFilter, search, statusFilter]);

  const summary = useMemo(() => {
    return filteredActivities.reduce(
      (acc, activity) => {
        acc.total += 1;
        acc[activity.currentStatus] += 1;

        if (activity.hasProblem) {
          acc.problems += 1;
        }

        return acc;
      },
      {
        total: 0,
        sent: 0,
        delivered: 0,
        bounced: 0,
        complained: 0,
        suppressed: 0,
        failed: 0,
        problems: 0,
      },
    );
  }, [filteredActivities]);

  const columns = [
    columnHelper.accessor("search", {
      id: "recipient",
      header: "Recipient",
      cell: ({ row }) => {
        const activity = row.original;
        return (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-foreground">
              {activity.toName || activity.memberName || activity.toEmail}
            </span>
            <span className="text-sm text-muted-foreground">{activity.toEmail}</span>
          </div>
        );
      },
    }),
    columnHelper.accessor("kind", {
      header: "Type",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <Badge variant="secondary" className="w-fit">
            {getKindLabel(row.original.kind)}
          </Badge>
          {row.original.subject ? (
            <span className="max-w-xs truncate text-xs text-muted-foreground">
              {row.original.subject}
            </span>
          ) : null}
        </div>
      ),
    }),
    columnHelper.accessor("currentStatus", {
      header: "Status",
      cell: ({ row }) => (
        <Status variant={getStatusVariant(row.original.currentStatus)}>
          <StatusIndicator />
          <StatusLabel className="capitalize">
            {row.original.currentStatus.replaceAll("_", " ")}
          </StatusLabel>
        </Status>
      ),
    }),
    columnHelper.accessor("memberName", {
      header: "Related",
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
    }),
    columnHelper.accessor("lastStatusAt", {
      header: "Last update",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span>{formatDateTime(row.original.lastStatusAt)}</span>
          {row.original.sentAt ? (
            <span className="text-xs">Sent {formatDateTime(row.original.sentAt)}</span>
          ) : null}
        </div>
      ),
    }),
    columnHelper.accessor("lastError", {
      header: "Problem",
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
      cell: ({ row }) => {
        const activity = row.original;

        return (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => updateSearchParam(activity.id)}
            >
              <EyeIcon data-icon="inline-start" />
              Details
            </Button>
            {activity.memberId ? (
              <Button asChild type="button" size="sm" variant="outline">
                <Link href={`/admin/members?edit=${activity.memberId}`}>
                  <ArrowUpRightIcon data-icon="inline-start" />
                  Open member
                </Link>
              </Button>
            ) : null}
            {activity.canResend && activity.memberId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={resendInviteAction.isPending}
                onClick={() => {
                  void resendInviteAction.executeAsync({ memberId: activity.memberId! });
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

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Sent" value={summary.sent} />
        <SummaryCard label="Delivered" value={summary.delivered} />
        <SummaryCard label="Problems" value={summary.problems} tone="problem" />
        <SummaryCard label="Suppressed" value={summary.suppressed} tone="problem" />
        <SummaryCard label="Bounced" value={summary.bounced} tone="problem" />
        <SummaryCard label="Complained" value={summary.complained} tone="problem" />
        <SummaryCard label="Failed" value={summary.failed} tone="problem" />
        <SummaryCard label="Visible records" value={summary.total} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="w-full lg:max-w-sm">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search recipient, member, subject, or provider id..."
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as "all" | EmailActivityRow["currentStatus"])
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
        <Select
          value={kindFilter}
          onValueChange={(value) => setKindFilter(value as "all" | EmailActivityRow["kind"])}
        >
          <SelectTrigger className="w-full lg:w-[220px]">
            <SelectValue placeholder="Email type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All email types</SelectItem>
            <SelectItem value="member_activation_invite">
              Member activation invite
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={problemFilter}
          onValueChange={(value) => setProblemFilter(value as "all" | "problems")}
        >
          <SelectTrigger className="w-full lg:w-[180px]">
            <SelectValue placeholder="Problem filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All records</SelectItem>
            <SelectItem value="problems">Problems only</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={dateRange}
          onValueChange={(value) => setDateRange(value as "7d" | "30d" | "90d" | "all")}
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
      </div>

      <DataTable
        data={filteredActivities}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        emptyStateTitle="No email activity yet"
        emptyStateDescription="New invite emails will appear here once they are sent through Spoleek."
      />

      <Sheet
        open={selectedActivity != null}
        onOpenChange={(open) => {
          if (!open) {
            updateSearchParam(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          {selectedActivity ? (
            <div className="flex h-full flex-col gap-8 pb-10">
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <SheetTitle>Email details</SheetTitle>
                  <Status variant={getStatusVariant(selectedActivity.currentStatus)}>
                    <StatusIndicator />
                    <StatusLabel className="capitalize">
                      {selectedActivity.currentStatus.replaceAll("_", " ")}
                    </StatusLabel>
                  </Status>
                </div>
                <SheetDescription>
                  Overview and lifecycle of {selectedActivity.toEmail}
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-8 px-4 pb-4 text-sm">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground">Recipient</span>
                    <span className="font-medium text-foreground">{selectedActivity.toEmail}</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground">Provider ID</span>
                    <span className="font-mono text-xs text-foreground tracking-tight break-all">
                      {selectedActivity.providerEmailId || "Not available"}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground">Type</span>
                    <div className="w-fit">
                      <Badge variant="secondary" className="font-normal text-muted-foreground">
                        {getKindLabel(selectedActivity.kind)}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground">From</span>
                    <span className="font-medium text-foreground">{selectedActivity.fromEmail}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-4 border-t border-border pt-6">
                  <h3 className="font-semibold text-base tracking-tight text-foreground">
                    Related member
                  </h3>
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-foreground">
                          {selectedActivity.memberName || "No linked member"}
                        </span>
                        {selectedActivity.memberId ? (
                          <Link 
                            href={`/admin/members?edit=${selectedActivity.memberId}`}
                            className="inline-flex items-center gap-1 text-sm font-medium hover:underline text-muted-foreground hover:text-foreground"
                          >
                            <ArrowUpRightIcon className="size-3.5" />
                            Open profile
                          </Link>
                        ) : null}
                      </div>
                      <div className="text-muted-foreground capitalize mt-0.5">
                        {selectedActivity.memberStatus?.replaceAll("_", " ") || "Unknown status"}
                      </div>
                    </div>
                    
                    {selectedActivity.canResend && selectedActivity.memberId ? (
                      <div className="mt-1">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline text-foreground disabled:opacity-50"
                          disabled={resendInviteAction.isPending}
                          onClick={() => {
                            void resendInviteAction.executeAsync({
                              memberId: selectedActivity.memberId!,
                            });
                          }}
                        >
                          <MailIcon className="size-4" />
                          Resend invite
                        </button>
                      </div>
                    ) : null}

                    {!selectedActivity.canResend && selectedActivity.resendDisabledReason ? (
                      <p className="text-muted-foreground mt-1 text-sm">
                        {selectedActivity.resendDisabledReason}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-4 border-t border-border pt-6">
                  <h3 className="font-semibold text-base tracking-tight text-foreground">
                    Timestamps
                  </h3>
                  <div className="flex flex-col gap-3">
                    <DeliveryRow label="Accepted" value={formatMaybeDate(selectedActivity.sentAt)} />
                    <DeliveryRow label="Delivered" value={formatMaybeDate(selectedActivity.deliveredAt)} />
                    {selectedActivity.bouncedAt && (
                      <DeliveryRow label="Bounced" value={formatMaybeDate(selectedActivity.bouncedAt)} />
                    )}
                    {selectedActivity.complainedAt && (
                      <DeliveryRow label="Complained" value={formatMaybeDate(selectedActivity.complainedAt)} />
                    )}
                    {selectedActivity.suppressedAt && (
                      <DeliveryRow label="Suppressed" value={formatMaybeDate(selectedActivity.suppressedAt)} />
                    )}
                    {selectedActivity.failedAt && (
                      <DeliveryRow label="Failed" value={formatMaybeDate(selectedActivity.failedAt)} />
                    )}
                  </div>
                  {selectedActivity.lastError ? (
                    <div className="mt-3 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                      <span className="leading-snug">{selectedActivity.lastError}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-5 border-t border-border pt-6">
                  <h3 className="font-semibold text-base tracking-tight text-foreground">
                    Event timeline
                  </h3>
                  <div>
                    <Timeline activeIndex={selectedActivity.events.length}>
                      {selectedActivity.events.map((event) => {
                        const isError =
                          event.eventType === "bounced" ||
                          event.eventType === "complained" ||
                          event.eventType === "suppressed" ||
                          event.eventType === "failed";
                        const isSuccess = event.eventType === "delivered";

                        return (
                          <TimelineItem key={event.id}>
                            <TimelineConnector />
                            <TimelineDot
                              className={cn(
                                isError && "border-destructive text-destructive",
                                isSuccess && "border-primary text-primary",
                              )}
                            />
                            <TimelineContent>
                              <TimelineHeader>
                                <TimelineTitle className="capitalize text-foreground">
                                  {event.eventType.replaceAll("_", " ")}
                                </TimelineTitle>
                                <TimelineTime>
                                  {formatDateTime(event.occurredAt)}
                                </TimelineTime>
                              </TimelineHeader>
                              {(event.message || event.providerEventType) && (
                                <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-border/50 bg-muted/40 p-3 shadow-sm">
                                  {event.message && (
                                    <TimelineDescription className="text-foreground">
                                      {event.message}
                                    </TimelineDescription>
                                  )}
                                  {event.providerEventType && (
                                    <TimelineDescription className="font-mono text-xs text-muted-foreground/80">
                                      Provider event: {event.providerEventType}
                                    </TimelineDescription>
                                  )}
                                </div>
                              )}
                            </TimelineContent>
                          </TimelineItem>
                        );
                      })}
                    </Timeline>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "problem";
}) {
  return (
    <Card className={tone === "problem" ? "border-destructive/20" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function DeliveryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-sm text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function formatMaybeDate(value: Date | null) {
  return value ? formatDateTime(value) : "Not recorded";
}
