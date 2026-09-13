"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { CheckIcon, CopyIcon, Loader2Icon, SendIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { sendEventInviteEmailsAction } from "@/server/actions/events";
import type { EmailActivityRow } from "@/server/queries/email-activity";
import type { EventRecipient } from "@/server/queries/events";

const FILTERS: { value: EventRecipientFilter; label: string; hint: string; primary?: boolean }[] = [
  { value: "not_responded", label: "Not yet answered", hint: "Eligible members without a response.", primary: true },
  { value: "all_eligible", label: "Everyone invited", hint: "Every eligible member." },
  { value: "not_activated", label: "No account yet", hint: "Cannot sign in — they get a link instead." },
  { value: "externals", label: "External invitees", hint: "People added by email.", primary: true },
  { value: "accepted", label: "Going", hint: "Confirmed yes answers, members and guests." },
  { value: "reserve", label: "Reserve list", hint: "Yes answers waiting for a place." },
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
  const [copied, setCopied] = useState<EventRecipientFilter | null>(null);

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
      setCopied(value);
      setTimeout(() => setCopied((c) => (c === value ? null : c)), 1500);
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

  const canSend = eventStatus === "published";

  return (
    <div className="flex flex-col gap-8">
      {!canSend ? (
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          The event is <span className="font-medium text-foreground">{eventStatus}</span>. You can copy lists, but invite
          links only work once it is published.
        </p>
      ) : null}

      <section className="rounded-xl border">
        <header className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Recipients</h3>
          <p className="text-xs text-muted-foreground">
            Each invite carries a personal RSVP link. Lists are deduplicated by address.
          </p>
        </header>
        <ul className="divide-y">
          {FILTERS.map((f) => {
            const count = recipients[f.value].length;
            const empty = count === 0;
            return (
              <li key={f.value} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <span
                  className={cn(
                    "w-10 shrink-0 font-heading text-2xl leading-none tabular-nums tracking-tight",
                    empty ? "text-muted-foreground/50" : "text-foreground",
                  )}
                >
                  {count}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", empty && "text-muted-foreground")}>{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.hint}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={empty}
                    onClick={() => copy(f.value)}
                    aria-label={`Copy ${f.label} emails`}
                  >
                    {copied === f.value ? (
                      <CheckIcon data-icon="inline-start" className="text-primary" />
                    ) : (
                      <CopyIcon data-icon="inline-start" />
                    )}
                    {copied === f.value ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    size="sm"
                    variant={f.primary && !empty ? "default" : "outline"}
                    disabled={!canSend || empty}
                    onClick={() => openDialog(f.value)}
                  >
                    <SendIcon data-icon="inline-start" />
                    Send
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Send log</h3>
          {sendLog.length > 0 ? (
            <span className="text-xs tabular-nums text-muted-foreground">{sendLog.length} sent</span>
          ) : null}
        </div>
        {sendLog.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No invites sent for this event yet.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {sendLog.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    row.hasProblem ? "bg-destructive" : "bg-primary",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{row.memberName ?? row.toName ?? row.toEmail}</span>
                  {row.memberName || row.toName ? (
                    <span className="ml-2 text-xs text-muted-foreground">{row.toEmail}</span>
                  ) : null}
                </span>
                <Badge variant={row.hasProblem ? "destructive" : "outline"} className="capitalize">
                  {row.currentStatus}
                </Badge>
                <span className="w-36 text-right text-xs tabular-nums text-muted-foreground">
                  {formatDateTime(row.lastStatusAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

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
            <div className="flex items-baseline gap-2 rounded-lg bg-muted/50 px-4 py-3">
              {dryRunCount == null ? (
                <span className="text-sm text-muted-foreground">Counting recipients…</span>
              ) : (
                <>
                  <span className="font-heading text-3xl leading-none tabular-nums">{dryRunCount}</span>
                  <span className="text-sm text-muted-foreground">
                    recipient{dryRunCount === 1 ? "" : "s"} will be emailed
                  </span>
                </>
              )}
            </div>
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
              ) : (
                <SendIcon data-icon="inline-start" />
              )}
              Send to {dryRunCount ?? 0}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
