"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  BarChart3Icon,
  BellIcon,
  CalendarIcon,
  ClipboardListIcon,
  LayoutTemplateIcon,
  ListChecksIcon,
  LockIcon,
  LockOpenIcon,
  SettingsIcon,
  UserRoundIcon,
} from "lucide-react";
import { toast } from "sonner";

import { DetailHeader, DetailMeta, DetailMetaItem } from "@/components/app/detail-header";
import { EventAdminStats } from "@/components/app/events/event-admin-stats";
import type { OwnerOptions } from "@/components/app/events/event-wizard/types";
import type { FormAudienceRow } from "@/components/app/forms/form-audience-editor";
import { FormBuilder } from "@/components/app/forms/form-builder";
import { FormRemindersPanel } from "@/components/app/forms/form-reminders-panel";
import { FormSettingsPanel } from "@/components/app/forms/form-settings-panel";
import { FormSubmissionsTable } from "@/components/app/forms/form-submissions-table";
import { FormSummary } from "@/components/app/forms/form-summary";
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
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formStatusDotVariant, formTimingLabel } from "@/lib/forms/display";
import { cn } from "@/lib/utils";
import { setFormStatusAction } from "@/server/actions/forms";
import type { Event, Form, FormQuestion } from "@/server/db/schema";
import type { FieldViewerAccess } from "@/server/lib/member-field-visibility";
import type { EmailActivityRow } from "@/server/queries/email-activity";
import type { EditorQuestion, FillerQuestion, PendingIdentity, QuestionAggregate, SubmissionRow } from "@/server/queries/forms";

const STEPS = ["questions", "settings", "submissions", "summary", "reminders"] as const;
type Step = (typeof STEPS)[number];

const STEP_META: Record<Step, { label: string; icon: typeof ListChecksIcon }> = {
  questions: { label: "Questions", icon: ListChecksIcon },
  settings: { label: "Settings", icon: SettingsIcon },
  submissions: { label: "Submissions", icon: ClipboardListIcon },
  summary: { label: "Summary", icon: BarChart3Icon },
  reminders: { label: "Reminders", icon: BellIcon },
};

function toStep(value: string | undefined): Step {
  return STEPS.includes(value as Step) ? (value as Step) : "questions";
}

function Body({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={cn("pt-6", wide ? "w-full" : "max-w-4xl")}>{children}</div>;
}

export type FormEditorProps = {
  form: Form;
  event: Event | null;
  ownerName: string | null;
  owners: OwnerOptions;
  questions: EditorQuestion[];
  fillerQuestions: FillerQuestion[];
  audience: FormAudienceRow[];
  eligibleCount: number;
  submissions: { questions: FormQuestion[]; rows: SubmissionRow[] };
  aggregates: { submissionCount: number; shreddedCount: number; questions: QuestionAggregate[] };
  pending: PendingIdentity[];
  sendLog: EmailActivityRow[];
  viewerAccess: FieldViewerAccess;
  canWrite: boolean;
  hasShredAnchor: boolean;
  timeZone: string;
  defaultStep?: string;
};

export function FormEditor(props: FormEditorProps) {
  const { form, event, ownerName, canWrite } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { locale } = useFormatters();

  const [step, setStep] = useState<Step>(toStep(props.defaultStep));
  const [dirty, setDirty] = useState(false);
  const [pendingStep, setPendingStep] = useState<Step | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<"open" | "closed" | null>(null);

  const commitStep = useCallback(
    (next: Step) => {
      setStep(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "questions") params.delete("step");
      else params.set("step", next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const goTo = (next: Step) => {
    if (next === step) return;
    if (dirty) {
      setPendingStep(next);
      return;
    }
    commitStep(next);
  };

  const statusAction = useAction(setFormStatusAction, {
    onSuccess() {
      toast.success(confirmStatus === "open" ? "Form opened." : "Form closed.");
      setConfirmStatus(null);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not change the status.");
    },
  });

  const closesAt = form.closesAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: props.timeZone }).format(form.closesAt)
    : null;
  const inputCount = props.questions.filter((q) => q.kind === "input").length;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        backHref="/admin/forms"
        backLabel="All forms"
        badges={
          <>
            {form.isTemplate ? (
              <Badge variant="secondary">
                <LayoutTemplateIcon data-icon="inline-start" />
                Template
              </Badge>
            ) : (
              <Status variant={formStatusDotVariant[form.status]}>
                <StatusIndicator />
                <StatusLabel className="capitalize">{form.status}</StatusLabel>
              </Status>
            )}
            {!form.isTemplate ? <Badge variant="outline">{formTimingLabel[form.timing]}</Badge> : null}
            {form.required ? <Badge variant="outline">Required</Badge> : null}
          </>
        }
        title={form.title}
        meta={
          <DetailMeta>
            {event ? (
              <DetailMetaItem icon={<CalendarIcon aria-hidden />}>
                <Link href={`/admin/events/${event.id}?tab=forms`} className="hover:underline">
                  {event.title}
                </Link>
              </DetailMetaItem>
            ) : null}
            <DetailMetaItem icon={<UserRoundIcon aria-hidden />}>{ownerName ?? "Whole organization"}</DetailMetaItem>
            {closesAt ? <DetailMetaItem icon={<LockIcon aria-hidden />}>Closes {closesAt}</DetailMetaItem> : null}
          </DetailMeta>
        }
        actions={
          canWrite && !form.isTemplate ? (
            form.status === "open" ? (
              <Button variant="outline" onClick={() => setConfirmStatus("closed")}>
                <LockIcon data-icon="inline-start" />
                Close form
              </Button>
            ) : (
              <Button onClick={() => setConfirmStatus("open")} disabled={inputCount === 0}>
                <LockOpenIcon data-icon="inline-start" />
                {form.status === "draft" ? "Open form" : "Reopen form"}
              </Button>
            )
          ) : null
        }
      />

      {!form.isTemplate ? (
        <EventAdminStats
          stats={[
            {
              key: "submissions",
              label: "Submissions",
              value: props.aggregates.submissionCount,
              hint: props.aggregates.shreddedCount > 0 ? `${props.aggregates.shreddedCount} shredded` : "answers received",
              onClick: () => goTo("submissions"),
            },
            {
              key: "pending",
              label: "Pending",
              value: props.pending.length,
              hint: form.required ? "eligible, not yet answered" : "optional form — nobody is nagged",
              tone: "warning",
              onClick: () => goTo("reminders"),
            },
            {
              key: "questions",
              label: "Questions",
              value: inputCount,
              hint: props.questions.some((q) => q.sensitivity === "special_category") ? "includes sensitive answers" : "on the form",
              onClick: () => goTo("questions"),
            },
            {
              key: "sent",
              label: "Reminders",
              value: props.sendLog.length,
              hint: props.sendLog.length > 0 ? "emails sent" : "none sent yet",
              onClick: () => goTo("reminders"),
            },
          ]}
        />
      ) : null}

      <Tabs value={step} onValueChange={(v) => goTo(v as Step)}>
        <TabsList>
          {STEPS.filter((s) => !form.isTemplate || s === "questions" || s === "settings").map((s) => {
            const meta = STEP_META[s];
            return (
              <TabsTrigger key={s} value={s}>
                <meta.icon data-icon="inline-start" />
                {meta.label}
                {s === "submissions" && props.submissions.rows.length > 0 ? (
                  <span className="text-xs font-normal tabular-nums text-muted-foreground">{props.submissions.rows.length}</span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="questions">
          <Body>
            {canWrite ? (
              <FormBuilder formId={form.id} questions={props.questions} hasShredAnchor={props.hasShredAnchor} onDirtyChange={setDirty} />
            ) : (
              <ReadOnlyQuestions questions={props.questions} />
            )}
          </Body>
        </TabsContent>
        <TabsContent value="settings">
          <Body>
            <FormSettingsPanel
              form={form}
              eventTitle={event?.title ?? null}
              owners={props.owners}
              audience={props.audience}
              eligibleCount={props.eligibleCount}
              canWrite={canWrite}
              onDirtyChange={setDirty}
            />
          </Body>
        </TabsContent>
        <TabsContent value="submissions">
          <Body wide>
            <FormSubmissionsTable
              formId={form.id}
              questions={props.submissions.questions}
              fillerQuestions={props.fillerQuestions}
              rows={props.submissions.rows}
              hasEvent={event != null}
              canWrite={canWrite}
              shredNote={(days) => `deleted ${days} days after ${event ? "the event" : "the deadline"}`}
            />
          </Body>
        </TabsContent>
        <TabsContent value="summary">
          <Body wide>
            <FormSummary
              questions={props.submissions.questions}
              aggregates={props.aggregates.questions}
              submissionCount={props.aggregates.submissionCount}
            />
          </Body>
        </TabsContent>
        <TabsContent value="reminders">
          <Body>
            <FormRemindersPanel
              formId={form.id}
              formStatus={form.status}
              required={form.required}
              pending={props.pending}
              sendLog={props.sendLog}
              canWrite={canWrite}
            />
          </Body>
        </TabsContent>
      </Tabs>

      <AlertDialog open={pendingStep != null} onOpenChange={(open) => !open && setPendingStep(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>Your changes on this tab have not been saved and will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingStep) {
                  setDirty(false);
                  commitStep(pendingStep);
                }
                setPendingStep(null);
              }}
            >
              Discard and leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmStatus != null} onOpenChange={(open) => !open && setConfirmStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmStatus === "open" ? "Open this form?" : "Close this form?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmStatus === "open"
                ? "People who can see it can submit answers from now on. No email is sent — use Reminders for that."
                : "Nobody can submit or edit answers until you reopen it. Existing answers are kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as is</AlertDialogCancel>
            <AlertDialogAction
              disabled={statusAction.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmStatus) statusAction.execute({ formId: form.id, status: confirmStatus });
              }}
            >
              {confirmStatus === "open" ? "Open form" : "Close form"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReadOnlyQuestions({ questions }: { questions: EditorQuestion[] }) {
  if (questions.length === 0) {
    return <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No questions yet.</p>;
  }
  return (
    <ol className="divide-y rounded-xl border">
      {questions.map((q, i) => (
        <li key={q.id} className="flex items-start gap-3 px-4 py-3 text-sm">
          <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={cn("font-medium", q.kind === "section" && "text-base")}>{q.label}</span>
            {q.kind === "input" ? (
              <span className="text-xs text-muted-foreground">
                {q.liveField?.type ?? q.type}
                {q.required ? " · required" : ""}
                {q.liveField ? ` · linked to ${q.liveField.label}` : ""}
                {q.sensitivity === "special_category" ? " · sensitive" : ""}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
