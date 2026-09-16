"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  ArrowLeftIcon,
  BanIcon,
  CircleAlertIcon,
  ClipboardListIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileTextIcon,
  InfoIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SendIcon,
  Trash2Icon,
  UsersIcon,
  UsersRoundIcon,
} from "lucide-react";
import { toast } from "sonner";

import { EventAdminHeader } from "@/components/app/events/event-admin-header";
import { EventAdminOverview } from "@/components/app/events/event-admin-overview";
import { EventAdminStats } from "@/components/app/events/event-admin-stats";
import type { AudienceDraft } from "@/components/app/events/event-audience-dialog";
import { EventAudiencePanel, type AudienceRow } from "@/components/app/events/event-audience-panel";
import { EventEmailsPanel } from "@/components/app/events/event-emails-panel";
import { EventFormsPanel, type EventFormRow } from "@/components/app/events/event-forms-panel";
import type { OwnerOptions, PaymentDefaults } from "@/components/app/events/event-wizard/types";
import { EventResponsesPanel } from "@/components/app/events/event-responses-panel";
import { EventWizardDialog } from "@/components/app/events/event-wizard/event-wizard-dialog";
import { useFormatters } from "@/components/locale-provider";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getEventNextStep, type EventNextStep } from "@/lib/events/next-step";
import type { TemplateOption } from "@/components/app/forms/form-create-dialog";
import { eventPriceToInput, type EventInput, type EventRecipientFilter } from "@/lib/events/schemas";
import { formatFeeAmount } from "@/lib/payments";
import { cn } from "@/lib/utils";
import {
  cancelEventAction,
  deleteEventAction,
  publishEventAction,
} from "@/server/actions/events";
import type { Event } from "@/server/db/schema";
import type { EmailActivityRow } from "@/server/queries/email-activity";
import type { EventCounts, EventRecipient, EventResponseRow } from "@/server/queries/events";

const VALID_TABS = ["overview", "audience", "responses", "emails", "forms"] as const;
type TabValue = (typeof VALID_TABS)[number];

function toValidTab(tab: string | undefined): TabValue {
  return VALID_TABS.includes(tab as TabValue) ? (tab as TabValue) : "overview";
}

/** Same wrapper on every tab so empty states line up; `wide` for the table. */
function TabBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={cn("pt-6", wide ? "w-full" : "max-w-4xl")}>{children}</div>;
}

function TabCount({ value }: { value: number }) {
  if (value === 0) return null;
  return <span className="text-xs font-normal tabular-nums text-muted-foreground">{value}</span>;
}

const BANNER_TONE: Record<EventNextStep["tone"], { alert: string; title: string; icon: string }> = {
  info: { alert: "border-primary/30 bg-primary/5", title: "text-foreground", icon: "text-primary" },
  warning: {
    alert: "border-amber-500/30 bg-amber-500/5",
    title: "text-amber-700 dark:text-amber-500",
    icon: "text-amber-600 dark:text-amber-500",
  },
  danger: { alert: "border-destructive/30 bg-destructive/5", title: "text-destructive", icon: "text-destructive" },
};

export function EventAdminDetail({
  event,
  ownerName,
  timeZone,
  owners,
  paymentDefaults,
  audience,
  eligibleCount,
  responses,
  counts,
  recipients,
  sendLog,
  publicUrl,
  forms,
  unlinkedForms,
  formTemplates,
  defaultTab,
}: {
  event: Event;
  ownerName: string | null;
  timeZone: string;
  owners: OwnerOptions;
  paymentDefaults: PaymentDefaults;
  audience: AudienceRow[];
  eligibleCount: number;
  responses: EventResponseRow[];
  counts: EventCounts;
  recipients: Record<EventRecipientFilter, EventRecipient[]>;
  sendLog: EmailActivityRow[];
  publicUrl: string | null;
  forms: EventFormRow[];
  unlinkedForms: { id: string; title: string }[];
  formTemplates: TemplateOption[];
  defaultTab?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale } = useFormatters();

  const [activeTab, setActiveTab] = useState<TabValue>(toValidTab(defaultTab));
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<"publish" | "cancel" | "delete" | null>(null);

  const handleTabChange = useCallback(
    (value: string) => {
      const tab = toValidTab(value);
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "overview") params.delete("tab");
      else params.set("tab", tab);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const refresh = (message: string) => ({
    onSuccess() {
      toast.success(message);
      setConfirm(null);
      router.refresh();
    },
    onError({ error }: { error: { serverError?: string } }) {
      toast.error(error.serverError ?? "Something went wrong.");
    },
  });

  const publishAction = useAction(publishEventAction, refresh("Event published."));
  const cancelAction = useAction(cancelEventAction, refresh("Event cancelled."));
  const deleteAction = useAction(deleteEventAction, {
    onSuccess() {
      toast.success("Event deleted.");
      router.push("/admin/events");
    },
  });

  const formValues: EventInput = {
    ...event,
    descriptionHtml: event.descriptionHtml,
    ...eventPriceToInput(event),
  };
  const memberRules = audience.flatMap((r): AudienceDraft[] => {
    if (r.kind === "group" && r.groupId) return [{ kind: "group", groupId: r.groupId, label: r.label }];
    if (r.kind === "category" && r.categoryId) return [{ kind: "category", categoryId: r.categoryId, label: r.label }];
    if (r.kind === "member" && r.memberId) return [{ kind: "member", memberId: r.memberId, label: r.label }];
    return [];
  });

  const externalCount = audience.filter((r) => r.kind === "external").length;
  const audienceRuleCount = audience.length;
  const notResponded = recipients.not_responded.length;

  const nextStep = getEventNextStep({
    event,
    counts,
    eligibleCount,
    notRespondedCount: notResponded,
    sentCount: sendLog.length,
  });

  const runBannerAction = (target: NonNullable<EventNextStep["action"]>["target"]) => {
    if (target === "publish") setConfirm("publish");
    else handleTabChange(target);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/events">
            <ArrowLeftIcon data-icon="inline-start" />
            All events
          </Link>
        </Button>
      </div>

      <EventAdminHeader
        event={event}
        ownerName={ownerName}
        locale={locale}
        timeZone={timeZone}
        actions={
          <>
            {event.status === "draft" ? (
              <Button onClick={() => setConfirm("publish")}>
                <SendIcon data-icon="inline-start" />
                Publish
              </Button>
            ) : event.status === "published" ? (
              <Button onClick={() => handleTabChange("emails")}>
                <MailIcon data-icon="inline-start" />
                Send invites
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/portal/events/${event.slug}`}>
                    <EyeIcon />
                    View as member
                  </Link>
                </DropdownMenuItem>
                {publicUrl ? (
                  <DropdownMenuItem asChild>
                    <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLinkIcon />
                      Open public page
                    </a>
                  </DropdownMenuItem>
                ) : null}
                {event.status === "published" ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setConfirm("cancel")}>
                      <BanIcon />
                      Cancel event
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setConfirm("delete")}>
                  <Trash2Icon />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {nextStep ? (
        <Alert className={cn("max-w-4xl px-4 py-3.5", BANNER_TONE[nextStep.tone].alert)}>
          {nextStep.tone === "info" ? (
            <InfoIcon className={BANNER_TONE[nextStep.tone].icon} />
          ) : (
            <CircleAlertIcon className={BANNER_TONE[nextStep.tone].icon} />
          )}
          <AlertTitle className={cn("text-base", BANNER_TONE[nextStep.tone].title)}>{nextStep.title}</AlertTitle>
          <AlertDescription>{nextStep.description}</AlertDescription>
          {nextStep.action ? (
            <AlertAction className="top-3.5 right-3.5">
              <Button variant="outline" size="sm" onClick={() => runBannerAction(nextStep.action!.target)}>
                {nextStep.action.label}
              </Button>
            </AlertAction>
          ) : null}
        </Alert>
      ) : null}

      <EventAdminStats
        stats={[
          {
            key: "going",
            label: "Going",
            value: counts.confirmedSeats,
            of: event.capacity,
            hint: event.capacity ? "confirmed places, guests included" : "confirmed, guests included",
            onClick: () => handleTabChange("responses"),
          },
          {
            key: "reserve",
            label: "Reserve",
            value: counts.reserveCount,
            hint: counts.reserveCount > 0 ? "waiting for a place" : "nobody waiting",
            tone: "warning",
            onClick: () => handleTabChange("responses"),
          },
          {
            key: "audience",
            label: "Invited",
            value: eligibleCount + externalCount,
            hint:
              event.visibility === "targeted"
                ? externalCount > 0
                  ? `${eligibleCount} members + ${externalCount} external`
                  : "members matching the rules"
                : event.visibility === "public"
                  ? "eligible members · page is public"
                  : "every active member",
            onClick: () => handleTabChange("audience"),
          },
          {
            key: "pending",
            label: "No answer",
            value: notResponded,
            hint: sendLog.length > 0 ? `${sendLog.length} invite email${sendLog.length === 1 ? "" : "s"} sent` : "no invites sent yet",
            onClick: () => handleTabChange("emails"),
          },
          ...(event.priceAmount !== null || counts.chargedCount > 0
            ? [
                {
                  key: "paid",
                  label: "Paid",
                  value: counts.paidCount,
                  of: counts.chargedCount,
                  hint: counts.currency
                    ? `${formatFeeAmount(counts.collectedMinor, counts.currency)} collected · ${formatFeeAmount(counts.outstandingMinor, counts.currency)} outstanding`
                    : "nobody charged yet",
                  onClick: () => handleTabChange("responses"),
                },
              ]
            : []),
        ]}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">
            <FileTextIcon data-icon="inline-start" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="audience">
            <UsersRoundIcon data-icon="inline-start" />
            Audience
            <TabCount value={audienceRuleCount} />
          </TabsTrigger>
          <TabsTrigger value="responses">
            <UsersIcon data-icon="inline-start" />
            Responses
            <TabCount value={responses.length} />
          </TabsTrigger>
          <TabsTrigger value="emails">
            <MailIcon data-icon="inline-start" />
            Emails
            <TabCount value={sendLog.length} />
          </TabsTrigger>
          <TabsTrigger value="forms">
            <ClipboardListIcon data-icon="inline-start" />
            Forms
            <TabCount value={forms.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <TabBody wide>
            <EventAdminOverview
              event={event}
              locale={locale}
              timeZone={timeZone}
              counts={counts}
              publicUrl={publicUrl}
              onEdit={() => setEditOpen(true)}
            />
          </TabBody>
        </TabsContent>

        <TabsContent value="audience">
          <TabBody>
            <EventAudiencePanel
              eventId={event.id}
              visibility={event.visibility}
              rules={audience}
              eligibleCount={eligibleCount}
              onEditVisibility={() => setEditOpen(true)}
            />
          </TabBody>
        </TabsContent>

        <TabsContent value="responses">
          <TabBody wide>
            <EventResponsesPanel
              eventId={event.id}
              capacity={event.capacity}
              priced={event.priceAmount !== null}
              responses={responses}
              counts={counts}
            />
          </TabBody>
        </TabsContent>

        <TabsContent value="emails">
          <TabBody>
            <EventEmailsPanel eventId={event.id} eventStatus={event.status} recipients={recipients} sendLog={sendLog} />
          </TabBody>
        </TabsContent>

        <TabsContent value="forms">
          <TabBody>
            <EventFormsPanel eventId={event.id} forms={forms} unlinked={unlinkedForms} templates={formTemplates} owners={owners} />
          </TabBody>
        </TabsContent>
      </Tabs>

      <EventWizardDialog
        open={editOpen}
        event={formValues}
        audience={memberRules}
        owners={owners}
        paymentDefaults={paymentDefaults}
        chargedCount={counts.chargedCount}
        onOpenChange={setEditOpen}
        onSaved={() => router.refresh()}
      />

      <AlertDialog open={confirm != null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "publish" ? "Publish this event?" : confirm === "cancel" ? "Cancel this event?" : "Delete this event?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "publish"
                ? "It becomes visible to its audience and RSVP opens. No email is sent — use the Emails tab for that."
                : confirm === "cancel"
                  ? "It stays visible, marked as cancelled, and RSVP closes. Responses are kept."
                  : "It disappears from every list. Responses are kept for the retention period."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as is</AlertDialogCancel>
            <AlertDialogAction
              className={confirm === "delete" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
              onClick={() => {
                if (confirm === "publish") publishAction.execute({ eventId: event.id });
                if (confirm === "cancel") cancelAction.execute({ eventId: event.id });
                if (confirm === "delete") deleteAction.execute({ eventId: event.id });
              }}
            >
              {confirm === "publish" ? "Publish" : confirm === "cancel" ? "Cancel event" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
