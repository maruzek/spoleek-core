"use client";

import Link from "next/link";
import { useFormatters } from "@/components/locale-provider";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { ArrowUpRightIcon, MailIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { EmailPreview } from "@/components/app/emails/email-preview";
import {
  formatMaybeDate,
  getEmailKindLabel,
  getEmailStatusVariant,
} from "@/components/app/emails/email-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { resendMemberInviteAction } from "@/server/actions/member-admin";
import type { EmailActivityDetail } from "@/server/queries/email-activity";

function DeliveryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-sm text-right font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

/**
 * Full record for one email: identity, related member, delivery timestamps,
 * and the provider event timeline. Shared by the org email dashboard and a
 * member's Emails tab, so troubleshooting looks the same from either entry.
 */
export function EmailDetailSheet({
  activity,
  open,
  onOpenChange,
  showRelatedMember = true,
}: {
  activity: EmailActivityDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Off on a member's own page, where "related member" is the page itself. */
  showRelatedMember?: boolean;
}) {
  const { formatDateTime } = useFormatters();

  const router = useRouter();

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        {activity ? (
          <div className="flex h-full flex-col gap-8 pb-10">
            <SheetHeader>
              <div className="flex items-center gap-3">
                <SheetTitle>Email details</SheetTitle>
                <Status variant={getEmailStatusVariant(activity.currentStatus)}>
                  <StatusIndicator />
                  <StatusLabel className="capitalize">
                    {activity.currentStatus.replaceAll("_", " ")}
                  </StatusLabel>
                </Status>
              </div>
              <SheetDescription>
                Overview and lifecycle of {activity.toEmail}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-8 px-4 pb-4 text-sm">
              <div className="flex flex-col gap-3">
                <h3 className="font-semibold text-base tracking-tight text-foreground">
                  Message
                </h3>
                <EmailPreview key={activity.id} emailActivityId={activity.id} />
              </div>

              <div className="flex flex-col gap-6 border-t border-border pt-6">
                <div className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground">Subject</span>
                  <span className="font-medium text-foreground">
                    {activity.subject}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground">Recipient</span>
                  <span className="font-medium text-foreground">
                    {activity.toEmail}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground">Provider ID</span>
                  <span className="font-mono text-xs tracking-tight break-all text-foreground">
                    {activity.providerEmailId || "Not available"}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground">Type</span>
                  <div className="w-fit">
                    <Badge
                      variant="secondary"
                      className="font-normal text-muted-foreground"
                    >
                      {getEmailKindLabel(activity.kind)}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground">From</span>
                  <span className="font-medium text-foreground">
                    {activity.fromEmail}
                  </span>
                </div>
              </div>

              {showRelatedMember ? (
                <div className="flex flex-col gap-4 border-t border-border pt-6">
                  <h3 className="font-semibold text-base tracking-tight text-foreground">
                    Related member
                  </h3>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-foreground">
                        {activity.memberName || "No linked member"}
                      </span>
                      {activity.memberId ? (
                        <Link
                          href={`/admin/members/${activity.memberId}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
                        >
                          <ArrowUpRightIcon className="size-3.5" />
                          Open profile
                        </Link>
                      ) : null}
                    </div>
                    <span className="capitalize text-muted-foreground">
                      {activity.memberStatus?.replaceAll("_", " ") ||
                        "Unknown status"}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-border pt-6">
                <h3 className="font-semibold text-base tracking-tight text-foreground">
                  Actions
                </h3>
                {activity.canResend && activity.memberId ? (
                  <Button
                    variant="outline"
                    className="w-fit"
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
                ) : (
                  <p className="text-muted-foreground">
                    {activity.resendDisabledReason ??
                      "No actions available for this email."}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-4 border-t border-border pt-6">
                <h3 className="font-semibold text-base tracking-tight text-foreground">
                  Timestamps
                </h3>
                <div className="flex flex-col gap-3">
                  <DeliveryRow
                    label="Accepted"
                    value={formatMaybeDate(activity.sentAt, formatDateTime)}
                  />
                  <DeliveryRow
                    label="Delivered"
                    value={formatMaybeDate(activity.deliveredAt, formatDateTime)}
                  />
                  {activity.bouncedAt ? (
                    <DeliveryRow
                      label="Bounced"
                      value={formatMaybeDate(activity.bouncedAt, formatDateTime)}
                    />
                  ) : null}
                  {activity.complainedAt ? (
                    <DeliveryRow
                      label="Complained"
                      value={formatMaybeDate(activity.complainedAt, formatDateTime)}
                    />
                  ) : null}
                  {activity.suppressedAt ? (
                    <DeliveryRow
                      label="Suppressed"
                      value={formatMaybeDate(activity.suppressedAt, formatDateTime)}
                    />
                  ) : null}
                  {activity.failedAt ? (
                    <DeliveryRow
                      label="Failed"
                      value={formatMaybeDate(activity.failedAt, formatDateTime)}
                    />
                  ) : null}
                </div>
                {activity.lastError ? (
                  <div className="mt-3 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                    <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                    <span className="leading-snug">{activity.lastError}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-5 border-t border-border pt-6">
                <h3 className="font-semibold text-base tracking-tight text-foreground">
                  Event timeline
                </h3>
                <Timeline activeIndex={activity.events.length}>
                  {activity.events.map((event) => {
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
                          {event.message || event.providerEventType ? (
                            <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-border/50 bg-muted/40 p-3 shadow-sm">
                              {event.message ? (
                                <TimelineDescription className="text-foreground">
                                  {event.message}
                                </TimelineDescription>
                              ) : null}
                              {event.providerEventType ? (
                                <TimelineDescription className="font-mono text-xs text-muted-foreground/80">
                                  Provider event: {event.providerEventType}
                                </TimelineDescription>
                              ) : null}
                            </div>
                          ) : null}
                        </TimelineContent>
                      </TimelineItem>
                    );
                  })}
                </Timeline>
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
