"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { type HookSafeActionFn, useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import {
  ArrowLeftRightIcon,
  ClockIcon,
  LogOutIcon,
  PlusIcon,
  SendIcon,
  XIcon,
} from "lucide-react";

import { CopyButton } from "@/components/app/copy-button";
import { useDictionary, useFormatters } from "@/components/locale-provider";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { PortalAvailableAction } from "@/lib/groups/portal-actions";
import {
  joinGroupAction,
  leaveGroupAction,
  requestToJoinGroupAction,
  withdrawJoinRequestAction,
} from "@/server/actions/group-membership-requests";
import type { PortalAvailableGroup, PortalGroup } from "@/server/queries/portal-groups";

/** What the action slot needs from a group — the page passes a subset. */
export type ActionableGroup = Pick<PortalAvailableGroup, "id" | "name" | "joinPolicy" | "leaders">;
export type LeavableGroup = Pick<
  PortalGroup,
  "id" | "name" | "canLeave" | "leaveBlockedReason" | "role" | "isLastAdmin"
>;
import { cn } from "@/lib/utils";

const MESSAGE_MAX = 500;

/**
 * The one shared shape for every self-service call: a toast either way and a
 * server-side refresh so the card re-renders from the real row, never from
 * an optimistic guess about what the leaders have done meanwhile.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useGroupAction<TAction extends HookSafeActionFn<string, any, any, any>>(
  action: TAction,
  successMessage: string,
  onDone?: () => void,
) {
  const router = useRouter();
  const t = useDictionary().portalGroups;

  return useAction(action, {
    onSuccess() {
      toast.success(successMessage);
      onDone?.();
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? t.failed);
    },
  });
}

// ─── Available group: the action slot ───────────────────────────────────────

export function JoinButton({ group }: { group: ActionableGroup }) {
  const t = useDictionary().portalGroups;
  const join = useGroupAction(joinGroupAction, t.joined(group.name));

  return (
    <Button
      size="sm"
      onClick={() => join.execute({ groupId: group.id })}
      disabled={join.isPending}
    >
      {join.isPending ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
      {t.join}
    </Button>
  );
}

export function SwitchDialog({
  group,
  from,
}: {
  group: ActionableGroup;
  from: { id: string; name: string };
}) {
  const t = useDictionary().portalGroups;
  const [open, setOpen] = useState(false);
  const join = useGroupAction(joinGroupAction, t.switched(group.name), () => setOpen(false));

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ArrowLeftRightIcon data-icon="inline-start" />
        {t.switchTo}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.switchTitle(from.name, group.name)}</AlertDialogTitle>
          <AlertDialogDescription>{t.switchBody(from.name, group.name)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={join.isPending}>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              join.execute({ groupId: group.id });
            }}
            disabled={join.isPending}
          >
            {join.isPending ? <Spinner data-icon="inline-start" /> : null}
            {t.switchTo}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RequestDialog({
  group,
  again = false,
}: {
  group: ActionableGroup;
  again?: boolean;
}) {
  const t = useDictionary().portalGroups;
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const request = useGroupAction(
    requestToJoinGroupAction,
    t.requested(group.name),
    () => {
      setOpen(false);
      setMessage("");
    },
  );
  const left = MESSAGE_MAX - message.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant={again ? "outline" : "default"} onClick={() => setOpen(true)}>
        <SendIcon data-icon="inline-start" />
        {again ? t.requestAgain : t.request}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.requestTitle(group.name)}</DialogTitle>
          <DialogDescription>{t.requestBody}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={`request-message-${group.id}`}>{t.requestMessageLabel}</FieldLabel>
          <FieldContent>
            <Textarea
              id={`request-message-${group.id}`}
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, MESSAGE_MAX))}
              placeholder={t.requestMessagePlaceholder}
              rows={4}
              maxLength={MESSAGE_MAX}
              autoFocus
            />
            <p
              className={cn(
                "text-right text-xs tabular-nums text-muted-foreground",
                left < 40 && "text-orange-600 dark:text-orange-400",
              )}
              aria-live="polite"
            >
              {t.charactersLeft(left)}
            </p>
          </FieldContent>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={request.isPending}>
            {t.cancel}
          </Button>
          <Button
            onClick={() => request.execute({ groupId: group.id, message })}
            disabled={request.isPending}
          >
            {request.isPending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
            {t.send}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WithdrawButton({ group }: { group: ActionableGroup }) {
  const t = useDictionary().portalGroups;
  const [open, setOpen] = useState(false);
  const withdraw = useGroupAction(withdrawJoinRequestAction, t.withdrawn, () => setOpen(false));

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <XIcon data-icon="inline-start" />
        {t.withdraw}
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.withdrawTitle}</AlertDialogTitle>
          <AlertDialogDescription>{t.withdrawBody(group.name)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={withdraw.isPending}>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              withdraw.execute({ groupId: group.id });
            }}
            disabled={withdraw.isPending}
          >
            {withdraw.isPending ? <Spinner data-icon="inline-start" /> : null}
            {t.withdraw}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Renders whatever `action.kind` calls for, state copy included. */
export function AvailableActionSlot({
  group,
  action,
}: {
  group: ActionableGroup;
  action: PortalAvailableAction;
}) {
  const t = useDictionary().portalGroups;
  const { formatDate } = useFormatters();

  switch (action.kind) {
    case "join":
      return <JoinButton group={group} />;
    case "switch":
      return <SwitchDialog group={group} from={action.from} />;
    case "request":
      return <RequestDialog group={group} />;
    case "pending":
      return (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm">
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange-500/60" />
              <span className="relative inline-flex size-2 rounded-full bg-orange-500" />
            </span>
            <span>
              <span className="font-medium text-foreground">{t.pendingTitle(formatDate(action.requestedAt))}</span>
              <span className="text-muted-foreground"> · {t.pendingDetail}</span>
            </span>
          </p>
          <WithdrawButton group={group} />
        </div>
      );
    case "declined":
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            <span className="font-medium text-foreground">{t.declinedTitle(formatDate(action.decidedAt))}</span>
          </p>
          <blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground italic">
            {action.reason ?? t.declinedNoReason}
          </blockquote>
          {action.canRequestAgain ? (
            <div>
              <RequestDialog group={group} again />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t.declinedBlocked}</p>
          )}
        </div>
      );
    case "ask_leader": {
      const first = group.leaders.find((leader) => leader.email);
      return (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t.askLeaderHint}</p>
          {first?.email ? <CopyButton size="sm" variant="outline" value={first.email} label={t.askLeader} /> : null}
        </div>
      );
    }
    case "blocked":
      return (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ClockIcon className="size-3.5 shrink-0" aria-hidden />
            {t.blocked[action.reason]}
          </p>
          <Button size="sm" variant="outline" disabled>
            {group.joinPolicy === "request_to_join" ? t.request : t.join}
          </Button>
        </div>
      );
  }
}

// ─── Own group: leave ───────────────────────────────────────────────────────

/**
 * A menu item plus its confirmation. The item stays visible when leaving is
 * blocked, disabled with the reason, so the member learns the rule instead of
 * hunting for a button that is not there.
 */
export function LeaveMenuItem({ group }: { group: LeavableGroup }) {
  const t = useDictionary().portalGroups;
  const [open, setOpen] = useState(false);
  const leave = useGroupAction(leaveGroupAction, t.left(group.name), () => setOpen(false));

  return (
    <>
      <DropdownMenuItem
        variant="destructive"
        disabled={!group.canLeave}
        onSelect={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
        title={group.leaveBlockedReason ? t.leaveBlocked[group.leaveBlockedReason] : undefined}
      >
        <LogOutIcon />
        {t.leave}
      </DropdownMenuItem>
      {!group.canLeave && group.leaveBlockedReason ? (
        <p className="px-2 pb-1.5 text-xs text-muted-foreground">
          {t.leaveBlocked[group.leaveBlockedReason]}
        </p>
      ) : null}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.leaveTitle(group.name)}</AlertDialogTitle>
            <AlertDialogDescription className="flex flex-col gap-2">
              <span>{t.leaveBody}</span>
              {group.role === "group_admin" ? (
                <span className="font-medium text-orange-700 dark:text-orange-300">
                  {group.isLastAdmin ? t.leaveLastAdminWarning : t.leaveAdminWarning}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leave.isPending}>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                leave.execute({ groupId: group.id });
              }}
              disabled={leave.isPending}
            >
              {leave.isPending ? <Spinner data-icon="inline-start" /> : null}
              {t.leave}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
