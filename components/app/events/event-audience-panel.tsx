"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import type { AudienceRuleInput } from "@/lib/events/schemas";
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

export type AudienceOptions = {
  groups: { id: string; name: string; categoryId: string }[];
  categories: { id: string; name: string }[];
  members: { id: string; firstName: string; lastName: string; email: string | null }[];
};

type Draft = AudienceRuleInput & { label: string };

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

function draftKey(d: AudienceRuleInput) {
  switch (d.kind) {
    case "group":
      return `group:${d.groupId}`;
    case "category":
      return `category:${d.categoryId}`;
    case "member":
      return `member:${d.memberId}`;
    case "external":
      return `external:${d.externalEmail}`;
  }
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
  options,
  eligibleCount,
}: {
  eventId: string;
  visibility: "public" | "org" | "targeted";
  rules: AudienceRow[];
  options: AudienceOptions;
  eligibleCount: number;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>(() => rules.map(toDraft).filter((d): d is Draft => d != null));
  const [dirty, setDirty] = useState(false);
  const [groupPick, setGroupPick] = useState("");
  const [categoryPick, setCategoryPick] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [externalText, setExternalText] = useState("");

  const externals = rules.filter((r) => r.kind === "external");

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

  const add = (draft: Draft) => {
    const key = draftKey(draft);
    setDrafts((current) => (current.some((d) => draftKey(d) === key) ? current : [...current, draft]));
    setDirty(true);
  };
  const remove = (key: string) => {
    setDrafts((current) => current.filter((d) => draftKey(d) !== key));
    setDirty(true);
  };

  const memberMatches = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const chosen = new Set(drafts.filter((d) => d.kind === "member").map((d) => draftKey(d)));
    return options.members
      .filter((m) => !chosen.has(`member:${m.id}`))
      .filter((m) => [m.firstName, m.lastName, m.email ?? ""].join(" ").toLowerCase().includes(q))
      .slice(0, 8);
  }, [memberQuery, options.members, drafts]);

  return (
    <div className="flex flex-col gap-6">
      {visibility !== "targeted" ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          This event is visible to {visibility === "public" ? "anyone" : "every active member"}. Audience rules are
          kept but only apply when visibility is set to <strong>Targeted</strong>.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-semibold">{eligibleCount}</span> eligible member{eligibleCount === 1 ? "" : "s"}
          {externals.length > 0 ? (
            <>
              {" "}
              + <span className="font-semibold">{externals.length}</span> external
            </>
          ) : null}
          {dirty ? <span className="ml-2 text-muted-foreground">(unsaved changes)</span> : null}
        </p>
        <Button
          size="sm"
          disabled={!dirty || saveAction.isPending}
          onClick={() =>
            saveAction.execute({
              eventId,
              rules: drafts.map(toRule),
            })
          }
        >
          {saveAction.isPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
          Save audience
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {drafts.length === 0 ? (
          <span className="text-sm text-muted-foreground">No rules yet — add a group, category or member below.</span>
        ) : null}
        {drafts.map((d) => {
          const key = draftKey(d);
          return (
            <Badge key={key} variant="secondary" className="gap-1 pr-1">
              <span className="capitalize text-muted-foreground">{d.kind}</span> {d.label}
              <button
                type="button"
                aria-label={`Remove ${d.label}`}
                className="ml-1 rounded-full p-0.5 hover:bg-muted"
                onClick={() => remove(key)}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          );
        })}
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="audience-group">Add group</FieldLabel>
          <FieldContent>
            <Select
              value={groupPick}
              onValueChange={(id) => {
                const group = options.groups.find((g) => g.id === id);
                if (group) add({ kind: "group", groupId: id, label: group.name });
                setGroupPick("");
              }}
            >
              <SelectTrigger id="audience-group">
                <SelectValue placeholder="Pick a group" />
              </SelectTrigger>
              <SelectContent>
                {options.groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="audience-category">Add category</FieldLabel>
          <FieldContent>
            <Select
              value={categoryPick}
              onValueChange={(id) => {
                const category = options.categories.find((c) => c.id === id);
                if (category) add({ kind: "category", categoryId: id, label: category.name });
                setCategoryPick("");
              }}
            >
              <SelectTrigger id="audience-category">
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {options.categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Every group in the category.</FieldDescription>
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="audience-member">Add member</FieldLabel>
          <FieldContent>
            <Input
              id="audience-member"
              placeholder="Search by name or email"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
            />
            {memberMatches.length > 0 ? (
              <ul className="mt-1 divide-y rounded-lg border">
                {memberMatches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        add({ kind: "member", memberId: m.id, label: getMemberDisplayName(m) });
                        setMemberQuery("");
                      }}
                    >
                      <span>{getMemberDisplayName(m)}</span>
                      <span className="text-xs text-muted-foreground">{m.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </FieldContent>
        </Field>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border p-4">
        <div>
          <p className="text-sm font-medium">External invitees</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            People outside the organization. Each gets a personal RSVP link when you send invites; nothing is sent now.
          </p>
        </div>
        {externals.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {externals.map((row) => (
              <li key={row.id}>
                <Badge variant="outline" className="gap-1 pr-1">
                  {row.externalName ? `${row.externalName} · ` : ""}
                  {row.externalEmail}
                  <button
                    type="button"
                    aria-label={`Remove ${row.externalEmail}`}
                    className="ml-1 rounded-full p-0.5 hover:bg-muted"
                    disabled={removeExternalAction.isPending}
                    onClick={() =>
                      removeExternalAction.execute({ eventId, externalEmail: row.externalEmail ?? "" })
                    }
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <Field>
          <FieldLabel htmlFor="audience-externals">Add by email</FieldLabel>
          <FieldContent>
            <Textarea
              id="audience-externals"
              rows={3}
              placeholder={"one per line, optionally Name <email>"}
              value={externalText}
              onChange={(e) => setExternalText(e.target.value)}
            />
          </FieldContent>
        </Field>
        <div className="flex justify-end">
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
  );
}
