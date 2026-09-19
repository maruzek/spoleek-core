"use client";

import { useEffect, useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { DownloadIcon, EyeIcon, EyeOffIcon, LockIcon, PencilIcon, PlusIcon, Trash2Icon, UserRoundPenIcon } from "lucide-react";
import { toast } from "sonner";

import { FormFiller } from "@/components/app/forms/form-filler";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { DataTable, SortableHeader } from "@/components/ui/data-table";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DetailDialog } from "@/components/app/detail-dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatMemberCustomFieldValue, getMemberDisplayName } from "@/lib/member-custom-fields";
import { matchesSearch } from "@/lib/search";
import { loadEventAudienceOptionsAction } from "@/server/actions/events";
import { deleteSubmissionAction, submitFormForMemberAction } from "@/server/actions/forms";
import type { CustomFieldValue, FormQuestion } from "@/server/db/schema";
import type { ReadAnswerResult } from "@/server/lib/forms/answers";
import type { FillerQuestion, SubmissionRow } from "@/server/queries/forms";

type Row = SubmissionRow & { name: string; email: string; search: string };
type MemberOption = { value: string; label: string; email: string | null };

const columnHelper = createColumnHelper<Row>();

function cellText(question: FormQuestion, cell: ReadAnswerResult | undefined) {
  if (!cell || cell.kind === "empty") return "";
  if (cell.kind === "withheld") return null;
  return formatMemberCustomFieldValue({ type: question.type ?? "text" }, cell.value) ?? String(cell.value);
}

/**
 * One column per input question, withheld cells as a lock. Sensitive columns
 * hide behind a toggle so a shared screen does not show a health answer by
 * accident; the CSV mirrors the toggle.
 */
export function FormSubmissionsTable({
  formId,
  questions,
  fillerQuestions,
  rows,
  hasEvent,
  canWrite,
  shredNote,
}: {
  formId: string;
  questions: FormQuestion[];
  fillerQuestions: FillerQuestion[];
  rows: SubmissionRow[];
  hasEvent: boolean;
  canWrite: boolean;
  shredNote?: (days: number) => string;
}) {
  const router = useRouter();
  const { formatDateTime } = useFormatters();
  const [showSensitive, setShowSensitive] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ mode: "add" } | { mode: "edit"; row: SubmissionRow } | null>(null);

  const inputs = useMemo(() => questions.filter((q) => q.kind === "input"), [questions]);
  const hasSensitive = inputs.some((q) => q.sensitivity === "special_category");
  const visibleInputs = inputs.filter((q) => showSensitive || q.sensitivity !== "special_category");

  const data = useMemo<Row[]>(
    () =>
      rows.map((row) => {
        const name = row.member ? getMemberDisplayName(row.member) : row.submission.guestName ?? "Guest";
        const email = row.member ? row.member.email ?? "" : row.submission.guestEmail ?? "";
        return { ...row, name, email, search: `${name} ${email}` };
      }),
    [rows],
  );

  const remove = useAction(deleteSubmissionAction, {
    onSuccess() {
      toast.success("Submission deleted.");
      setDeleteId(null);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not delete the submission.");
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor("search", {
        id: "who",
        meta: { label: "Who" },
        header: ({ column }) => <SortableHeader column={column}>Who</SortableHeader>,
        sortingFn: (a, b) => a.original.name.localeCompare(b.original.name),
        filterFn: (row, _id, value: string) => matchesSearch(row.original.search, value ?? ""),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 truncate font-medium">
              {row.original.name}
              {!row.original.member ? <Badge variant="outline">Guest</Badge> : null}
              {row.original.submission.submittedByUserId ? (
                <UserRoundPenIcon className="size-3.5 text-muted-foreground" aria-label="Entered by a manager" />
              ) : null}
            </span>
            {row.original.email ? <span className="truncate text-xs text-muted-foreground">{row.original.email}</span> : null}
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.submission.submittedAt.getTime(), {
        id: "submitted",
        meta: { label: "Submitted" },
        header: ({ column }) => <SortableHeader column={column}>Submitted</SortableHeader>,
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatDateTime(row.original.submission.submittedAt)}
            {row.original.submission.shreddedAt ? <Badge variant="outline" className="ml-2">Shredded</Badge> : null}
          </span>
        ),
      }),
      ...visibleInputs.map((q) =>
        columnHelper.display({
          id: `q:${q.id}`,
          meta: { label: q.label },
          header: () => (
            <span className="flex items-center gap-1">
              {q.sensitivity === "special_category" ? <LockIcon className="size-3 text-amber-600" aria-hidden /> : null}
              {q.label}
            </span>
          ),
          cell: ({ row }) => {
            const text = cellText(q, row.original.cells[q.id]);
            if (text === null) {
              return (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <LockIcon className="size-3" aria-hidden />
                  Withheld
                </Badge>
              );
            }
            return text ? <span className="line-clamp-2 max-w-64 text-sm">{text}</span> : <span className="text-muted-foreground">—</span>;
          },
        }),
      ),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) =>
          canWrite ? (
            <div className="flex justify-end gap-0.5">
              <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setSheet({ mode: "edit", row: row.original })}>
                <PencilIcon />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Delete" onClick={() => setDeleteId(row.original.submission.id)}>
                <Trash2Icon />
              </Button>
            </div>
          ) : null,
      }),
    ],
    [visibleInputs, formatDateTime, canWrite],
  );

  const exportHref = `/admin/forms/${formId}/export${showSensitive ? "?sensitive=1" : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        data={data}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        searchKey="who"
        searchPlaceholder="Search by name or email..."
        emptyStateTitle="No submissions yet"
        emptyStateDescription={canWrite ? "Add one on someone's behalf, or wait for the first answer." : "Answers will appear here."}
        initialSorting={[{ id: "submitted", desc: true }]}
        toolbarActions={() => (
          <div className="flex flex-wrap items-center gap-2">
            {hasSensitive ? (
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={showSensitive ? "show" : "hide"}
                onValueChange={(v) => v && setShowSensitive(v === "show")}
                aria-label="Sensitive answers"
              >
                <ToggleGroupItem value="hide" className="gap-1.5 px-3">
                  <EyeOffIcon className="size-3.5" aria-hidden />
                  Sensitive hidden
                </ToggleGroupItem>
                <ToggleGroupItem value="show" className="gap-1.5 px-3">
                  <EyeIcon className="size-3.5" aria-hidden />
                  Show sensitive
                </ToggleGroupItem>
              </ToggleGroup>
            ) : null}
            <Button asChild variant="outline" size="sm" disabled={rows.length === 0}>
              <a href={exportHref}>
                <DownloadIcon data-icon="inline-start" />
                CSV
              </a>
            </Button>
            {canWrite ? (
              <Button size="sm" onClick={() => setSheet({ mode: "add" })}>
                <PlusIcon data-icon="inline-start" />
                Add submission
              </Button>
            ) : null}
          </div>
        )}
      />

      <DetailDialog
        open={sheet != null}
        onOpenChange={(open) => !open && setSheet(null)}
        title={sheet?.mode === "edit" ? "Edit submission" : "Add submission"}
        description={
          sheet?.mode === "edit"
            ? "Recorded as edited by you."
            : "Recorded as entered by you on their behalf. The form's deadline does not apply."
        }
      >
          {sheet ? (
            <ProxyDialogBody
              formId={formId}
              mode={sheet}
              questions={fillerQuestions}
              hasEvent={hasEvent}
              shredNote={shredNote}
              onDone={() => {
                setSheet(null);
                router.refresh();
              }}
            />
          ) : null}
      </DetailDialog>

      <AlertDialog open={deleteId != null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
            <AlertDialogDescription>The answers are removed for good. The person can submit again while the form is open.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteId) remove.execute({ formId, submissionId: deleteId });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProxyDialogBody({
  formId,
  mode,
  questions,
  hasEvent,
  shredNote,
  onDone,
}: {
  formId: string;
  mode: { mode: "add" } | { mode: "edit"; row: SubmissionRow };
  questions: FillerQuestion[];
  hasEvent: boolean;
  shredNote?: (days: number) => string;
  onDone: () => void;
}) {
  const editing = mode.mode === "edit" ? mode.row : null;
  const [target, setTarget] = useState<"member" | "guest">(editing && !editing.member ? "guest" : "member");
  const [member, setMember] = useState<MemberOption | null>(
    editing?.member ? { value: editing.member.id, label: getMemberDisplayName(editing.member), email: editing.member.email } : null,
  );
  const [guest, setGuest] = useState({
    name: editing?.submission.guestName ?? "",
    email: editing?.submission.guestEmail ?? "",
  });
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const load = useAction(loadEventAudienceOptionsAction);
  const { execute: executeLoad } = load;
  useEffect(() => {
    if (!editing) executeLoad({});
  }, [executeLoad, editing]);

  const members = useMemo<MemberOption[]>(
    () => (load.result.data?.members ?? []).map((m) => ({ value: m.id, label: getMemberDisplayName(m), email: m.email })),
    [load.result.data],
  );

  const submit = useAction(submitFormForMemberAction, {
    onSuccess() {
      toast.success(editing ? "Submission updated." : "Submission added.");
      onDone();
    },
    onError({ error }) {
      const answers = (error.validationErrors as { answers?: Record<string, { _errors?: string[] }> } | undefined)?.answers;
      if (answers) {
        setServerErrors(Object.fromEntries(Object.entries(answers).map(([id, v]) => [id, v?._errors?.[0] ?? ""])));
      }
      toast.error(error.serverError ?? "Check the highlighted answers.");
    },
  });

  const initialValues: Record<string, CustomFieldValue> = {};
  if (editing) {
    for (const [id, cell] of Object.entries(editing.cells)) {
      if (cell.kind === "value") initialValues[id] = cell.value;
    }
  }
  const withheld = editing ? Object.values(editing.cells).some((c) => c.kind === "withheld") : false;

  const identityReady = target === "member" ? member != null : guest.email.trim().length > 3;

  return (
    <>
      <div className="flex flex-col gap-6">
        {!editing ? (
          <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
            {hasEvent ? (
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                value={target}
                onValueChange={(v) => v && setTarget(v as "member" | "guest")}
                aria-label="Who is this for"
              >
                <ToggleGroupItem value="member" className="px-3">
                  Member
                </ToggleGroupItem>
                <ToggleGroupItem value="guest" className="px-3">
                  Guest by email
                </ToggleGroupItem>
              </ToggleGroup>
            ) : null}
            {target === "member" ? (
              <Field>
                <FieldLabel htmlFor="proxy-member">Member</FieldLabel>
                <FieldContent>
                  <Combobox
                    items={members}
                    value={member}
                    onValueChange={(next: MemberOption | null) => setMember(next)}
                    itemToStringLabel={(item: MemberOption) => item.label}
                  >
                    <ComboboxInput id="proxy-member" placeholder={load.isPending ? "Loading members…" : "Search members"} showClear={member != null} />
                    <ComboboxContent>
                      <ComboboxEmpty>No member matches.</ComboboxEmpty>
                      <ComboboxList>
                        {(item: MemberOption) => (
                          <ComboboxItem key={item.value} value={item}>
                            <span className="flex flex-col">
                              {item.label}
                              {item.email ? <span className="text-xs text-muted-foreground">{item.email}</span> : null}
                            </span>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </FieldContent>
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="proxy-guest-name">Name</FieldLabel>
                  <FieldContent>
                    <Input id="proxy-guest-name" value={guest.name} onChange={(e) => setGuest((g) => ({ ...g, name: e.target.value }))} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="proxy-guest-email">Email</FieldLabel>
                  <FieldContent>
                    <Input id="proxy-guest-email" type="email" value={guest.email} onChange={(e) => setGuest((g) => ({ ...g, email: e.target.value }))} />
                  </FieldContent>
                </Field>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
            <span className="font-medium">{editing.member ? getMemberDisplayName(editing.member) : editing.submission.guestName}</span>
            <span className="ml-2 text-muted-foreground">{editing.member?.email ?? editing.submission.guestEmail}</span>
          </p>
        )}

        {withheld ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-500">
            Some answers are withheld from you. Saving keeps them as they are unless you type a new value.
          </p>
        ) : null}

        <FormFiller
          key={editing?.submission.id ?? "new"}
          questions={questions}
          initialValues={initialValues}
          mode="proxy"
          showSync={target === "member"}
          serverErrors={serverErrors}
          submitting={submit.isPending}
          submitLabel={editing ? "Save changes" : "Add submission"}
          shredNote={shredNote}
          footer={!identityReady ? "Pick who this is for first." : null}
          onSubmit={({ answers, syncToProfile }) => {
            if (!identityReady) return;
            setServerErrors({});
            submit.execute({
              formId,
              ...(target === "member"
                ? { memberId: member!.value }
                : { guestEmail: guest.email.trim(), guestName: guest.name.trim() || undefined }),
              answers,
              syncToProfile,
            });
          }}
        />
      </div>
    </>
  );
}
