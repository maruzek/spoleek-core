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
import { cn } from "@/lib/utils";
import { sendFormReminderEmailsAction } from "@/server/actions/forms";
import type { FormStatus } from "@/server/db/schema";
import type { EmailActivityRow } from "@/server/queries/email-activity";
import type { PendingIdentity } from "@/server/queries/forms";

/**
 * Pending list, copy button and the send dialog, all fed by one recipient
 * set so the count the manager confirms is the count that gets mailed.
 */
export function FormRemindersPanel({
  formId,
  formStatus,
  required,
  pending,
  sendLog,
  canWrite,
}: {
  formId: string;
  formStatus: FormStatus;
  required: boolean;
  pending: PendingIdentity[];
  sendLog: EmailActivityRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { formatDateTime } = useFormatters();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dryRunCount, setDryRunCount] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const mailable = pending.filter((p) => p.email);
  const canSend = canWrite && formStatus === "open";

  const sendAction = useAction(sendFormReminderEmailsAction, {
    onSuccess({ data }) {
      if (!data) return;
      if (data.dryRun) {
        setDryRunCount(data.recipientCount);
        return;
      }
      toast.success(`Reminders sent to ${data.recipientCount} recipient${data.recipientCount === 1 ? "" : "s"}.`);
      setDialogOpen(false);
      setDryRunCount(null);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not send reminders.");
    },
  });

  const copy = async () => {
    const list = mailable.map((r) => r.email).join(", ");
    if (!list) {
      toast.info("Nobody to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(list);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Clipboard is not available in this browser.");
    }
  };

  const openDialog = () => {
    setDryRunCount(null);
    setDialogOpen(true);
    sendAction.execute({ formId, dryRun: true });
  };

  return (
    <div className="flex flex-col gap-8">
      {!required ? (
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          This form is optional, so nobody counts as pending. Mark it <span className="font-medium text-foreground">required</span> in Settings to build a reminder list.
        </p>
      ) : formStatus !== "open" ? (
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          The form is <span className="font-medium text-foreground">{formStatus}</span>. Reminders only go out while it is open.
        </p>
      ) : null}

      <section className="rounded-xl border">
        <header className="flex flex-wrap items-center gap-4 px-4 py-3">
          <span
            className={cn(
              "font-semibold text-2xl leading-none tabular-nums tracking-tight",
              pending.length === 0 ? "text-muted-foreground/50" : "text-foreground",
            )}
          >
            {pending.length}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Still to answer</p>
            <p className="text-xs text-muted-foreground">
              Eligible people without a submission.
              {mailable.length < pending.length ? ` ${pending.length - mailable.length} without an email address.` : ""}
            </p>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" disabled={mailable.length === 0} onClick={copy}>
              {copied ? <CheckIcon data-icon="inline-start" className="text-primary" /> : <CopyIcon data-icon="inline-start" />}
              {copied ? "Copied" : "Copy emails"}
            </Button>
            <Button size="sm" disabled={!canSend || mailable.length === 0} onClick={openDialog}>
              <SendIcon data-icon="inline-start" />
              Send reminder
            </Button>
          </div>
        </header>
        {pending.length > 0 ? (
          <ul className="max-h-80 divide-y overflow-y-auto border-t">
            {pending.map((p) => (
              <li key={p.memberId ?? p.externalEmail ?? p.email} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{p.name ?? p.email}</span>
                  {p.name && p.email ? <span className="ml-2 text-xs text-muted-foreground">{p.email}</span> : null}
                </span>
                {!p.memberId ? <Badge variant="outline">External</Badge> : null}
                {!p.email ? <Badge variant="outline">No email</Badge> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Send log</h3>
          {sendLog.length > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{sendLog.length} sent</span> : null}
        </div>
        {sendLog.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No reminders sent for this form yet.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {sendLog.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className={cn("size-2 shrink-0 rounded-full", row.hasProblem ? "bg-destructive" : "bg-primary")} aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{row.memberName ?? row.toName ?? row.toEmail}</span>
                  {row.memberName || row.toName ? <span className="ml-2 text-xs text-muted-foreground">{row.toEmail}</span> : null}
                </span>
                <Badge variant={row.hasProblem ? "destructive" : "outline"} className="capitalize">
                  {row.currentStatus}
                </Badge>
                <span className="w-36 text-right text-xs tabular-nums text-muted-foreground">{formatDateTime(row.lastStatusAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send a reminder</DialogTitle>
            <DialogDescription>
              Members get a link to the portal; externals get a personal link. Nothing is sent until you confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-baseline gap-2 rounded-lg bg-muted/50 px-4 py-3">
            {dryRunCount == null ? (
              <span className="text-sm text-muted-foreground">Counting recipients…</span>
            ) : (
              <>
                <span className="font-semibold text-3xl leading-none tabular-nums">{dryRunCount}</span>
                <span className="text-sm text-muted-foreground">recipient{dryRunCount === 1 ? "" : "s"} will be emailed</span>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={sendAction.isPending}>
              Cancel
            </Button>
            <Button
              disabled={dryRunCount == null || dryRunCount === 0 || sendAction.isPending}
              onClick={() => sendAction.execute({ formId, dryRun: false })}
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
