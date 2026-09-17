"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { GlobeIcon, Loader2Icon, MailIcon, PlusIcon, UsersIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { AudienceRuleList, type AudienceKind, audienceDraftKey } from "@/components/app/events/audience-rule-list";
import { EventAudienceDialog, type AudienceDraft } from "@/components/app/events/event-audience-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AudienceRuleInput } from "@/lib/events/schemas";
import { cn } from "@/lib/utils";
import {
  addExternalInviteesAction,
  removeExternalInviteeAction,
  setEventAudienceAction,
} from "@/server/actions/events";

export type AudienceRow = {
  id: string;
  kind: "group" | "category" | "member" | "external";
  groupId: string | null;
  categoryId: string | null;
  memberId: string | null;
  externalEmail: string | null;
  externalName: string | null;
  label: string;
};

type Draft = AudienceDraft;

function toDraft(row: AudienceRow): Draft | null {
  if (row.kind === "group" && row.groupId) return { kind: "group", groupId: row.groupId, label: row.label };
  if (row.kind === "category" && row.categoryId) return { kind: "category", categoryId: row.categoryId, label: row.label };
  if (row.kind === "member" && row.memberId) return { kind: "member", memberId: row.memberId, label: row.label };
  return null;
}

function toRule(d: Draft): AudienceRuleInput {
  switch (d.kind) {
    case "group":
      return { kind: "group", groupId: d.groupId };
    case "category":
      return { kind: "category", categoryId: d.categoryId };
    case "member":
      return { kind: "member", memberId: d.memberId };
    case "external":
      return { kind: "external", externalEmail: d.externalEmail, externalName: d.externalName };
  }
}

const VISIBILITY_COPY = {
  public: {
    icon: GlobeIcon,
    title: "Anyone with the link can see this event",
    body: "Rules below still decide who counts as invited — that is who gets emails and the “no answer” count.",
  },
  org: {
    icon: UsersIcon,
    title: "Every active member can see this event",
    body: "Rules below are kept for later but do not narrow anything while visibility is “Whole organization”.",
  },
  targeted: {
    icon: UsersIcon,
    title: "Only the people matched by these rules can see this event",
    body: "Add a category, a group or single members. External invitees get a personal link instead of an account.",
  },
} as const;

function RuleChip({
  icon: Icon,
  label,
  hint,
  onRemove,
  disabled,
  muted,
}: {
  icon: typeof UsersIcon;
  label: string;
  hint?: string;
  onRemove: () => void;
  disabled?: boolean;
  muted?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card py-1.5 pr-1 pl-2.5 text-sm shadow-xs",
        muted && "border-dashed bg-transparent",
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate">{label}</span>
      {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
      <button
        type="button"
        aria-label={`Remove ${label}`}
        disabled={disabled}
        className="ml-0.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        onClick={onRemove}
      >
        <XIcon className="size-3.5" />
      </button>
    </li>
  );
}

/**
 * Rule editor. Member rules are edited as a draft and saved as a whole list;
 * external invitees are added and removed one by one because each one also
 * mints a token.
 */
export function EventAudiencePanel({
  eventId,
  visibility,
  rules,
  eligibleCount,
  onEditVisibility,
}: {
  eventId: string;
  visibility: "public" | "org" | "targeted";
  rules: AudienceRow[];
  eligibleCount: number;
  onEditVisibility?: () => void;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>(() => rules.map(toDraft).filter((d): d is Draft => d != null));
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<{ open: boolean; kind?: AudienceKind }>({ open: false });
  const [externalText, setExternalText] = useState("");

  const externals = rules.filter((r) => r.kind === "external");
  const copy = VISIBILITY_COPY[visibility];
  const VisibilityIcon = copy.icon;

  const saveAction = useAction(setEventAudienceAction, {
    onSuccess() {
      toast.success("Audience saved.");
      setDirty(false);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save the audience.");
    },
  });
  const addExternalAction = useAction(addExternalInviteesAction, {
    onSuccess({ data }) {
      toast.success(`${data?.added ?? 0} external invitee${data?.added === 1 ? "" : "s"} added.`);
      setExternalText("");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not add invitees.");
    },
  });
  const removeExternalAction = useAction(removeExternalInviteeAction, {
    onSuccess() {
      router.refresh();
    },
  });

  const chosen = useMemo(() => new Set(drafts.map(audienceDraftKey)), [drafts]);

  const addMany = (incoming: Draft[]) => {
    setDrafts((current) => {
      const have = new Set(current.map(audienceDraftKey));
      const fresh = incoming.filter((d) => !have.has(audienceDraftKey(d)));
      return fresh.length > 0 ? [...current, ...fresh] : current;
    });
    if (incoming.length > 0) setDirty(true);
  };
  const remove = (key: string) => {
    setDrafts((current) => current.filter((d) => audienceDraftKey(d) !== key));
    setDirty(true);
  };
  const discard = () => {
    setDrafts(rules.map(toDraft).filter((d): d is Draft => d != null));
    setDirty(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
        <VisibilityIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-sm font-medium">{copy.title}</p>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
        </div>
        {onEditVisibility ? (
          <Button variant="ghost" size="sm" onClick={onEditVisibility}>
            Change
          </Button>
        ) : null}
      </div>

      <section className="rounded-xl border">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h3 className="font-sans text-sm font-semibold">Members</h3>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{eligibleCount}</span> eligible right now
              {dirty ? " · counts update after saving" : ""}
            </p>
          </div>

          <Button size="sm" variant="outline" onClick={() => setPicker({ open: true })}>
            <PlusIcon data-icon="inline-start" />
            Add rule
          </Button>
        </header>

        <AudienceRuleList
          rules={drafts}
          emptyText={`No rules yet. ${visibility === "targeted" ? "Nobody can see this event until you add one." : "Everyone counts as invited."}`}
          disabled={saveAction.isPending}
          onRemove={remove}
          onAdd={(kind) => setPicker({ open: true, kind })}
        />

        {dirty ? (
          <footer className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t bg-amber-500/5 px-4 py-2.5">
            <p className="text-sm text-amber-700 dark:text-amber-500">Unsaved changes</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={discard} disabled={saveAction.isPending}>
                Discard
              </Button>
              <Button
                size="sm"
                disabled={saveAction.isPending}
                onClick={() => saveAction.execute({ eventId, rules: drafts.map(toRule) })}
              >
                {saveAction.isPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
                Save audience
              </Button>
            </div>
          </footer>
        ) : null}
      </section>

      <EventAudienceDialog
        open={picker.open}
        eventId={eventId}
        excludeKeys={chosen}
        initialKind={picker.kind}
        onOpenChange={(open) => setPicker((p) => ({ ...p, open }))}
        onAdd={addMany}
      />

      <section className="rounded-xl border">
        <header className="border-b px-4 py-3">
          <h3 className="font-sans text-sm font-semibold">
            External invitees{" "}
            {externals.length > 0 ? (
              <span className="font-normal tabular-nums text-muted-foreground">{externals.length}</span>
            ) : null}
          </h3>
          <p className="text-xs text-muted-foreground">
            People outside the organization. Each gets a personal RSVP link when you send invites; nothing is sent now.
          </p>
        </header>
        <div className="flex flex-col gap-4 p-4">
          {externals.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {externals.map((row) => (
                <RuleChip
                  key={row.id}
                  icon={MailIcon}
                  label={row.externalName ?? row.externalEmail ?? ""}
                  hint={row.externalName ? (row.externalEmail ?? undefined) : undefined}
                  muted
                  disabled={removeExternalAction.isPending}
                  onRemove={() => removeExternalAction.execute({ eventId, externalEmail: row.externalEmail ?? "" })}
                />
              ))}
            </ul>
          ) : null}
          <div className="flex flex-col gap-2">
            <Textarea
              id="audience-externals"
              aria-label="Add external invitees by email"
              rows={3}
              className="font-mono text-xs"
              placeholder={"jane@example.com\nJohn Doe <john@example.com>"}
              value={externalText}
              onChange={(e) => setExternalText(e.target.value)}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">One per line. Name is optional.</p>
              <Button
                size="sm"
                variant="outline"
                disabled={externalText.trim().length === 0 || addExternalAction.isPending}
                onClick={() => addExternalAction.execute({ eventId, emails: externalText })}
              >
                {addExternalAction.isPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
                Add invitees
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
