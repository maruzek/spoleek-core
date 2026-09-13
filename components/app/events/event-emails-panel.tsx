"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { CopyIcon, Loader2Icon, SendIcon } from "lucide-react";
import { toast } from "sonner";

import { useFormatters } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EventRecipientFilter } from "@/lib/events/schemas";
import { sendEventInviteEmailsAction } from "@/server/actions/events";
import type { EmailActivityRow } from "@/server/queries/email-activity";
import type { EventRecipient } from "@/server/queries/events";

const FILTERS: { value: EventRecipientFilter; label: string; hint: string }[] = [
  { value: "all_eligible", label: "Everyone invited", hint: "Every eligible member." },
  { value: "not_responded", label: "Not yet answered", hint: "Eligible members without a response." },
  { value: "not_activated", label: "No account yet", hint: "Eligible members who cannot sign in — they get a link instead." },
  { value: "accepted", label: "Going", hint: "Confirmed yes answers, members and guests." },
  { value: "reserve", label: "Reserve list", hint: "Yes answers waiting for a place." },
  { value: "externals", label: "External invitees", hint: "People added by email." },
];

/**
 * Copy lists and the send dialog, both fed by the same recipient sets so the
 * count on the button is the count that gets mailed. Sending is two steps by
 * design: pick a filter, see the number, confirm.
 */
export function EventEmailsPanel({
  eventId,
  eventStatus,
  recipients,
  sendLog,
}: {
  eventId: string;
  eventStatus: "draft" | "published" | "cancelled";
  recipients: Record<EventRecipientFilter, EventRecipient[]>;
  sendLog: EmailActivityRow[];
}) {
  const router = useRouter();
  const { formatDateTime } = useFormatters();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<EventRecipientFilter>("not_responded");
  const [dryRunCount, setDryRunCount] = useState<number | null>(null);

  const sendAction = useAction(sendEventInviteEmailsAction, {
    onSuccess({ data }) {
      if (!data) return;
      if (data.dryRun) {
        setDryRunCount(data.recipientCount);
        return;
      }
      toast.success(`Invites sent to ${data.recipientCount} recipient${data.recipientCount === 1 ? "" : "s"}.`);
      setDialogOpen(false);
      setDryRunCount(null);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not send invites.");
    },
  });

  const copy = async (value: EventRecipientFilter) => {
    const list = recipients[value].map((r) => r.email).join(", ");
    if (!list) {
      toast.info("Nobody matches this filter.");
      return;
    }
    try {
      await navigator.clipboard.writeText(list);
      toast.success(`${recipients[value].length} address${recipients[value].length === 1 ? "" : "es"} copied.`);
    } catch {
      toast.error("Clipboard is not available in this browser.");
    }
  };

  const openDialog = (value: EventRecipientFilter) => {
    setFilter(value);
    setDryRunCount(null);
    setDialogOpen(true);
    sendAction.execute({ eventId, filter: value, dryRun: true });
  };

  return (
    <div className="flex flex-col gap-6">
      {eventStatus !== "published" ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          The event is {eventStatus}. You can copy lists, but invite links only work once it is published.
        </p>
      ) : null}

      <ul className="divide-y rounded-xl border">
        {FILTERS.map((f) => (
          <li key={f.value} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {f.label} <span className="text-muted-foreground">· {recipients[f.value].length}</span>
              </p>
              <p className="text-xs text-muted-foreground">{f.hint}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => copy(f.value)}>
                <CopyIcon data-icon="inline-start" />
                Copy emails
              </Button>
              <Button
                size="sm"
                disabled={eventStatus !== "published" || recipients[f.value].length === 0}
                onClick={() => openDialog(f.value)}
              >
                <SendIcon data-icon="inline-start" />
                Send invite
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Send log</p>
        {sendLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invites sent for this event yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {sendLog.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {row.memberName ?? row.toName ?? row.toEmail}
                  <span className="ml-2 text-xs text-muted-foreground">{row.toEmail}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={row.hasProblem ? "destructive" : "outline"} className="capitalize">
                    {row.currentStatus}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTime(row.lastStatusAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send invite email</DialogTitle>
            <DialogDescription>
              Each recipient gets a personal RSVP link. Nothing is sent until you confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Select
              value={filter}
              onValueChange={(value: EventRecipientFilter) => {
                setFilter(value);
                setDryRunCount(null);
                sendAction.execute({ eventId, filter: value, dryRun: true });
              }}
            >
              <SelectTrigger aria-label="Recipients">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm">
              {dryRunCount == null ? (
                <span className="text-muted-foreground">Counting recipients…</span>
              ) : (
                <>
                  This will email <span className="font-semibold">{dryRunCount}</span> recipient
                  {dryRunCount === 1 ? "" : "s"}.
                </>
              )}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={sendAction.isPending}>
              Cancel
            </Button>
            <Button
              disabled={dryRunCount == null || dryRunCount === 0 || sendAction.isPending}
              onClick={() => sendAction.execute({ eventId, filter, dryRun: false })}
            >
              {sendAction.isPending && dryRunCount != null ? (
                <Loader2Icon className="animate-spin" data-icon="inline-start" />
              ) : null}
              Send to {dryRunCount ?? 0}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
