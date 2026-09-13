"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { ExternalLinkIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";

import { EventAudiencePanel, type AudienceOptions, type AudienceRow } from "@/components/app/events/event-audience-panel";
import { EventDetail } from "@/components/app/events/event-detail";
import { EventEmailsPanel } from "@/components/app/events/event-emails-panel";
import type { OwnerOptions } from "@/components/app/events/event-form";
import { EventResponsesPanel } from "@/components/app/events/event-responses-panel";
import { EventSheet } from "@/components/app/events/event-sheet";
import { useFormatters } from "@/components/locale-provider";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EventInput, EventRecipientFilter } from "@/lib/events/schemas";
import {
  cancelEventAction,
  deleteEventAction,
  publishEventAction,
  updateEventAction,
} from "@/server/actions/events";
import type { Event } from "@/server/db/schema";
import type { EmailActivityRow } from "@/server/queries/email-activity";
import type { EventRecipient, EventResponseRow } from "@/server/queries/events";

export function EventAdminDetail({
  event,
  ownerName,
  timeZone,
  owners,
  audience,
  audienceOptions,
  eligibleCount,
  responses,
  counts,
  recipients,
  sendLog,
  publicUrl,
}: {
  event: Event;
  ownerName: string | null;
  timeZone: string;
  owners: OwnerOptions;
  audience: AudienceRow[];
  audienceOptions: AudienceOptions;
  eligibleCount: number;
  responses: EventResponseRow[];
  counts: { confirmedSeats: number; reserveCount: number };
  recipients: Record<EventRecipientFilter, EventRecipient[]>;
  sendLog: EmailActivityRow[];
  publicUrl: string | null;
}) {
  const router = useRouter();
  const { locale } = useFormatters();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<"publish" | "cancel" | "delete" | null>(null);

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

  const updateAction = useAction(updateEventAction, {
    onSuccess() {
      toast.success("Event updated.");
      setEditOpen(false);
      router.refresh();
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

  const formValues: Partial<EventInput> = {
    ...event,
    descriptionHtml: event.descriptionHtml,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {publicUrl ? (
          <Button asChild variant="ghost" size="sm">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon data-icon="inline-start" />
              Public page
            </a>
          </Button>
        ) : null}
        <Button asChild variant="ghost" size="sm">
          <Link href={`/portal/events/${event.slug}`}>Portal view</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <PencilIcon data-icon="inline-start" />
          Edit
        </Button>
        {event.status === "draft" ? (
          <Button size="sm" onClick={() => setConfirm("publish")}>
            Publish
          </Button>
        ) : null}
        {event.status === "published" ? (
          <Button size="sm" variant="outline" onClick={() => setConfirm("cancel")}>
            Cancel event
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm("delete")}>
          Delete
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
          <TabsTrigger value="responses">Responses</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="max-w-3xl pt-6">
            <EventDetail event={event} ownerName={ownerName} locale={locale} timeZone={timeZone} showStatus counts={counts} />
          </div>
        </TabsContent>

        <TabsContent value="audience">
          <div className="max-w-3xl pt-6">
            <EventAudiencePanel
              eventId={event.id}
              visibility={event.visibility}
              rules={audience}
              options={audienceOptions}
              eligibleCount={eligibleCount}
            />
          </div>
        </TabsContent>

        <TabsContent value="responses">
          <div className="pt-6">
            <EventResponsesPanel eventId={event.id} capacity={event.capacity} responses={responses} counts={counts} />
          </div>
        </TabsContent>

        <TabsContent value="emails">
          <div className="max-w-3xl pt-6">
            <EventEmailsPanel eventId={event.id} eventStatus={event.status} recipients={recipients} sendLog={sendLog} />
          </div>
        </TabsContent>
      </Tabs>

      <EventSheet
        open={editOpen}
        event={formValues}
        owners={owners}
        isPending={updateAction.isPending}
        validationErrors={updateAction.result.validationErrors}
        onOpenChange={setEditOpen}
        onSubmit={async (value) => {
          const result = await updateAction.executeAsync({ ...value, id: event.id });
          if (result?.serverError) toast.error(result.serverError);
        }}
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
