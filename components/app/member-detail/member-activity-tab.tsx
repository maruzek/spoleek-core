"use client";

import { useMemo, useState } from "react";
import { useFormatters } from "@/components/locale-provider";
import { createColumnHelper } from "@tanstack/react-table";
import { HistoryIcon } from "lucide-react";

import { DetailSection } from "@/components/app/definition-list";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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
import type { MemberAuthEventType } from "@/server/db/schema";
import type { MemberAuthEventRow } from "@/server/queries/member-detail";
import type { MemberTimelineEvent } from "@/server/queries/members";

const AUTH_EVENT_LABELS: Record<MemberAuthEventType, string> = {
  member_approved: "Member approved",
  member_rejected: "Member rejected",
  invite_send_requested: "Invite send requested",
  invite_sent: "Invite sent",
  invite_send_skipped: "Invite send skipped",
  invite_delivery_updated: "Invite delivery updated",
  invite_completed: "Invite completed",
  activation_attempt_blocked: "Activation attempt blocked",
  password_reset_sent: "Password reset sent",
  workspace_provisioned: "Workspace account provisioned",
  workspace_provision_failed: "Workspace provisioning failed",
  workspace_user_linked: "Workspace user linked",
  data_exported: "Data export produced",
};

const FAILURE_EVENTS = new Set<MemberAuthEventType>([
  "member_rejected",
  "invite_send_skipped",
  "activation_attempt_blocked",
  "workspace_provision_failed",
]);

function getEventLabel(eventType: MemberAuthEventType) {
  return AUTH_EVENT_LABELS[eventType] ?? eventType.replaceAll("_", " ");
}

const columnHelper = createColumnHelper<MemberAuthEventRow>();

export function MemberActivityTab({
  timeline,
  authEvents,
}: {
  timeline: MemberTimelineEvent[];
  authEvents: MemberAuthEventRow[];
}) {
  const { formatDateTime } = useFormatters();

  const [typeFilter, setTypeFilter] = useState<"all" | "issues">("all");

  const filteredEvents = useMemo(
    () =>
      typeFilter === "issues"
        ? authEvents.filter((event) => FAILURE_EVENTS.has(event.eventType))
        : authEvents,
    [authEvents, typeFilter],
  );

  const issueCount = useMemo(
    () => authEvents.filter((event) => FAILURE_EVENTS.has(event.eventType)).length,
    [authEvents],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor(
        // The searchable column carries the actor and message too, so a plain
        // text search finds "workspace", a bounce message, or an admin's name.
        (event) =>
          [
            getEventLabel(event.eventType),
            event.message ?? "",
            event.actorName ?? "",
          ].join(" "),
        {
          id: "event",
          header: "Event",
          meta: { label: "Event" },
          cell: ({ row }) => (
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">
                {getEventLabel(row.original.eventType)}
              </span>
              {FAILURE_EVENTS.has(row.original.eventType) ? (
                <Badge variant="destructive">Issue</Badge>
              ) : null}
            </div>
          ),
        },
      ),
      columnHelper.accessor("message", {
        header: "Detail",
        meta: { label: "Detail" },
        cell: ({ row }) =>
          row.original.message ? (
            <span className="text-muted-foreground">{row.original.message}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      }),
      columnHelper.accessor("actorName", {
        header: "By",
        meta: { label: "By" },
        cell: ({ row }) =>
          row.original.actorName ? (
            <span className="text-muted-foreground">
              {row.original.actorName}
            </span>
          ) : (
            <span className="text-muted-foreground">System</span>
          ),
      }),
      columnHelper.accessor("createdAt", {
        header: "When",
        meta: { label: "When" },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      }),
    ],
    [formatDateTime],
  );

  if (timeline.length === 0 && authEvents.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HistoryIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing recorded yet</EmptyTitle>
          <EmptyDescription>
            Approvals, invites, and account linking will show up here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {timeline.length > 0 ? (
        <DetailSection
          title="Milestones"
          description="Creation, invite milestones, account linking, and consent."
        >
          <Timeline activeIndex={timeline.length - 1}>
            {timeline.map((event, index) => (
              <TimelineItem key={event.id}>
                <TimelineHeader>
                  <TimelineDot />
                  {index < timeline.length - 1 ? <TimelineConnector /> : null}
                </TimelineHeader>
                <TimelineContent>
                  <TimelineTime dateTime={event.date.toISOString()}>
                    {formatDateTime(event.date)}
                  </TimelineTime>
                  <TimelineTitle>{event.title}</TimelineTitle>
                  <TimelineDescription>{event.description}</TimelineDescription>
                </TimelineContent>
              </TimelineItem>
            ))}
          </Timeline>
        </DetailSection>
      ) : null}

      {authEvents.length > 0 ? (
        <>
          <Separator />
          <DetailSection
            title="Audit log"
            description="Every recorded authentication and provisioning event, newest first."
            actions={
              issueCount > 0 ? (
                <Select
                  value={typeFilter}
                  onValueChange={(value) =>
                    setTypeFilter(value as "all" | "issues")
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All events</SelectItem>
                    <SelectItem value="issues">
                      Issues only ({issueCount})
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : null
            }
          >
            <DataTable
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              columns={columns as any}
              data={filteredEvents}
              searchKey="event"
              searchPlaceholder="Search events..."
              emptyStateTitle="No matching events"
              emptyStateDescription="Try a different search term or clear the filter."
            />
          </DetailSection>
        </>
      ) : null}
    </div>
  );
}
