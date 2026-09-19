"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useStore } from "@tanstack/react-form";
import { useAction } from "next-safe-action/hooks";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  MailIcon,
  ScaleIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from "lucide-react";
import { toast } from "sonner";

import { MemberCustomFieldInput } from "@/components/app/member-custom-field-input";
import { MemberDataExportButton } from "@/components/app/member-data-export-button";
import { SwitchChoiceField } from "@/components/app/switch-choice-field";
import { useAppShell } from "@/components/app/app-shell-provider";
import { useDictionary, useFormatters } from "@/components/locale-provider";
import { Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { FieldHint } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Stat,
  StatDescription,
  StatGroup,
  StatLabel,
  StatMeter,
  StatValue,
  StatValueOf,
} from "@/components/ui/stat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { profileCompleteness } from "@/lib/portal-dashboard";
import { cn } from "@/lib/utils";
import { setHideFromGroupRostersAction } from "@/server/actions/group-page";
import {
  updateEmailPreferenceAction,
  updateProfileAction,
} from "@/server/actions/member";
import type {
  MemberCustomField,
  MemberPreferredEmail,
  MembershipStatus,
} from "@/server/db/schema";

type ProfileFormProps = {
  firstName: string;
  lastName: string;
  customFields: MemberCustomField[];
  customFieldAnswers: Record<string, unknown>;
  showIncompleteBanner: boolean;
  preferredEmail: MemberPreferredEmail | null;
  workspaceEmail: string | null;
  workspaceReady: boolean;
  personalEmail: string | null;
  /** The address the organization actually writes to, after preference resolution. */
  contactEmail: string | null;
  membershipStatus: MembershipStatus;
  memberSince: Date | null;
  /** Only when the organization shows group rosters; the switch is pointless otherwise. */
  rosterOptOut: { hidden: boolean } | null;
};

const STATUS_LABEL: Record<MembershipStatus, string> = {
  invited: "Invited",
  pending: "Awaiting approval",
  active: "Active",
  suspended: "Suspended",
  archived: "Archived",
  deleted: "Deleted",
};

const requiredMarker = <span className="ml-1 text-destructive">*</span>;

export function ProfileForm({
  firstName,
  lastName,
  customFields,
  customFieldAnswers,
  showIncompleteBanner,
  preferredEmail,
  workspaceEmail,
  workspaceReady,
  personalEmail,
  contactEmail,
  membershipStatus,
  memberSince,
  rosterOptOut,
}: ProfileFormProps) {
  const router = useRouter();
  const { organization } = useAppShell();
  const { formatDate } = useFormatters();

  const profileAction = useAction(updateProfileAction, {
    onSuccess() {
      toast.success("Profile saved.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save your profile.");
    },
  });

  const emailPrefAction = useAction(updateEmailPreferenceAction, {
    onSuccess() {
      toast.success("Email preference saved.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save the preference.");
    },
  });

  const fieldErrors = profileAction.result.validationErrors;
  const customFieldErrors = profileAction.result.data?.customFieldErrors ?? {};

  const form = useForm({
    defaultValues: { firstName, lastName, customFieldAnswers },
    onSubmit: async ({ value }) => {
      await profileAction.executeAsync(value);
    },
  });

  // What the organization asks of every member versus what it would merely
  // like to know. Optional-stage fields never gate anything.
  const askedFields = customFields.filter((f) => f.stage !== "optional");
  const optionalFields = customFields.filter((f) => f.stage === "optional");

  // Live, so the strip's meter moves as the member types.
  const completeness = useStore(form.store, (state) =>
    profileCompleteness(customFields, state.values.customFieldAnswers),
  );
  const missingRequired = completeness.missingRequired;
  const isDirty = useStore(form.store, (state) => state.isDirty);

  const [localPref, setLocalPref] = useState<string>(preferredEmail ?? "default");
  const defaultAddress =
    organization.defaultEmailPreference === "workspace" ? workspaceEmail : personalEmail;

  const emailOptions = [
    {
      value: "default",
      label: "Organization default",
      description: "Whatever the organization prefers — today that is:",
      address: defaultAddress,
    },
    {
      value: "personal",
      label: "Personal address",
      description: "The address you registered with.",
      address: personalEmail,
    },
    {
      value: "workspace",
      label: "Workspace address",
      description: `Your ${organization.name} Google Workspace account.`,
      address: workspaceEmail,
    },
  ];

  const renderCustomField = (field: MemberCustomField) => (
    <form.Field key={field.id} name={`customFieldAnswers.${field.key}` as never}>
      {(formField) => (
        <div
          id={`custom-field-anchor-${field.key}`}
          className={cn("scroll-mt-24", field.type === "textarea" && "sm:col-span-2")}
        >
          <MemberCustomFieldInput
            field={field}
            value={formField.state.value}
            error={customFieldErrors[field.key]?.[0]}
            onChange={(value) => formField.handleChange(value as never)}
          />
        </div>
      )}
    </form.Field>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* One strip: how complete, who you are here, where we reach you. */}
      <StatGroup variant="strip" columns={3}>
        <Stat>
          <StatLabel>Profile</StatLabel>
          <StatValue className="text-2xl">
            {completeness.filled}
            <StatValueOf>/ {completeness.total}</StatValueOf>
          </StatValue>
          <StatDescription>
            {completeness.total === 0
              ? "Nothing asked beyond your name"
              : missingRequired.length > 0
                ? `${missingRequired.length} required still empty`
                : completeness.missingOptional.length > 0
                  ? `${completeness.missingOptional.length} optional left blank`
                  : "Everything filled in"}
          </StatDescription>
          {completeness.total > 0 ? <StatMeter ratio={completeness.percent / 100} /> : null}
        </Stat>
        <Stat>
          <StatLabel>Membership</StatLabel>
          <StatValue className="text-2xl">{STATUS_LABEL[membershipStatus]}</StatValue>
          <StatDescription>
            {memberSince ? `Member since ${formatDate(memberSince)}` : organization.name}
          </StatDescription>
        </Stat>
        <Stat>
          <StatLabel>We write to</StatLabel>
          <StatValue className="truncate text-2xl">{contactEmail ?? "—"}</StatValue>
          <StatDescription>
            {workspaceReady && workspaceEmail
              ? "Change it under Contact"
              : "The address you registered with"}
          </StatDescription>
        </Stat>
      </StatGroup>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">
            <UserRoundIcon data-icon="inline-start" />
            Details
            {missingRequired.length > 0 ? (
              <span className="ml-1.5 text-xs tabular-nums text-orange-600 dark:text-orange-400">
                {missingRequired.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="contact">
            <MailIcon data-icon="inline-start" />
            Contact
          </TabsTrigger>
          <TabsTrigger value="privacy">
            <ShieldCheckIcon data-icon="inline-start" />
            Your data
          </TabsTrigger>
        </TabsList>

        {/* ── Details ── */}
        <TabsContent value="details" className="pt-4">
          <form
            className="flex flex-col gap-8"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            {showIncompleteBanner && missingRequired.length > 0 ? (
              <Notice
                tone="attention"
                icon={<AlertTriangleIcon />}
                title="Finish your profile to continue"
                description={
                  <>
                    {organization.name} needs{" "}
                    {missingRequired.map((field, index) => (
                      <span key={field.key}>
                        {index > 0 ? (index === missingRequired.length - 1 ? " and " : ", ") : ""}
                        <a
                          href={`#custom-field-anchor-${field.key}`}
                          className="font-medium text-foreground underline underline-offset-4"
                        >
                          {field.label}
                        </a>
                      </span>
                    ))}{" "}
                    before you can use the rest of the portal.
                  </>
                }
              />
            ) : null}

            <FieldSet>
              <FieldLegend className="flex items-center gap-2">
                Name
                <FieldHint>How you appear to admins and in group rosters.</FieldHint>
              </FieldLegend>
              <FieldGroup className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                <form.Field name="firstName">
                  {(formField) => (
                    <Field data-invalid={Boolean(fieldErrors?.firstName?._errors?.[0])}>
                      <FieldLabel htmlFor="profile-first-name">First name{requiredMarker}</FieldLabel>
                      <FieldContent>
                        <Input
                          id="profile-first-name"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) => formField.handleChange(event.target.value)}
                          autoComplete="given-name"
                          aria-invalid={Boolean(fieldErrors?.firstName?._errors?.[0])}
                        />
                        {fieldErrors?.firstName?._errors?.[0] ? (
                          <FieldError>{fieldErrors.firstName._errors[0]}</FieldError>
                        ) : null}
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>
                <form.Field name="lastName">
                  {(formField) => (
                    <Field data-invalid={Boolean(fieldErrors?.lastName?._errors?.[0])}>
                      <FieldLabel htmlFor="profile-last-name">Last name{requiredMarker}</FieldLabel>
                      <FieldContent>
                        <Input
                          id="profile-last-name"
                          value={formField.state.value}
                          onBlur={formField.handleBlur}
                          onChange={(event) => formField.handleChange(event.target.value)}
                          autoComplete="family-name"
                          aria-invalid={Boolean(fieldErrors?.lastName?._errors?.[0])}
                        />
                        {fieldErrors?.lastName?._errors?.[0] ? (
                          <FieldError>{fieldErrors.lastName._errors[0]}</FieldError>
                        ) : null}
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>
            </FieldSet>

            {askedFields.length > 0 ? (
              <FieldSet>
                <FieldLegend className="flex items-center gap-2">
                  What {organization.name} asks for
                  <FieldHint>
                    Fields marked <span className="text-destructive">*</span> are required for
                    membership. Only admins see your answers.
                  </FieldHint>
                </FieldLegend>
                <FieldGroup className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  {askedFields.map(renderCustomField)}
                </FieldGroup>
              </FieldSet>
            ) : null}

            {optionalFields.length > 0 ? (
              <FieldSet>
                <FieldLegend className="flex items-center gap-2">
                  Optional
                  <FieldHint>
                    Nice to have, never required. Leave blank anything you would rather not
                    share.
                  </FieldHint>
                </FieldLegend>
                <FieldGroup className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  {optionalFields.map(renderCustomField)}
                </FieldGroup>
              </FieldSet>
            ) : null}

            <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {isDirty ? "You have unsaved changes." : " "}
              </p>
              <Button type="submit" disabled={profileAction.isPending || !isDirty} className="min-w-32">
                {profileAction.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* ── Contact ── */}
        <TabsContent value="contact" className="pt-4">
          <div className="flex flex-col gap-8">
            <FieldSet>
              <FieldLegend className="flex items-center gap-2">
                Where we write to you
                <FieldHint>
                  Every email from {organization.name} — invitations, reminders, receipts — goes
                  to this one address. Your choice is saved as soon as you pick it.
                </FieldHint>
              </FieldLegend>
              {workspaceReady && workspaceEmail ? (
                <RadioGroup
                  value={localPref}
                  disabled={emailPrefAction.isPending}
                  onValueChange={(value) => {
                    setLocalPref(value);
                    const pref = value === "default" ? null : (value as MemberPreferredEmail);
                    void emailPrefAction.executeAsync({ preference: pref });
                  }}
                  className="max-w-2xl"
                >
                  {emailOptions.map((option) => {
                    const id = `epref-${option.value}`;
                    return (
                      <FieldLabel key={option.value} htmlFor={id}>
                        <Field orientation="horizontal">
                          <FieldContent>
                            <FieldTitle>{option.label}</FieldTitle>
                            <FieldDescription>
                              {option.description}{" "}
                              <span className="font-mono text-xs text-foreground">
                                {option.address ?? "no address on file"}
                              </span>
                            </FieldDescription>
                          </FieldContent>
                          <RadioGroupItem value={option.value} id={id} />
                        </Field>
                      </FieldLabel>
                    );
                  })}
                </RadioGroup>
              ) : (
                <Field orientation="horizontal" className="max-w-2xl">
                  <FieldContent>
                    <FieldTitle>Personal address</FieldTitle>
                    <FieldDescription>
                      <span className="font-mono text-xs text-foreground">
                        {personalEmail ?? "No address on file."}
                      </span>
                      <span className="mt-1 block">
                        {organization.name} does not use Google Workspace addresses, so this is
                        the only option.
                      </span>
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            </FieldSet>
          </div>
        </TabsContent>

        {/* ── Your data ── */}
        <TabsContent value="privacy" className="pt-4">
          <div className="flex flex-col gap-8">
            {/*
              Self-service is the point: an access request that the member can
              answer with one click never becomes a ticket, and the organization
              owes a reply within a month either way.
            */}
            <FieldSet>
              <FieldLegend className="flex items-center gap-2">
                Download a copy
                <FieldHint>
                  Your right of access under GDPR Art. 15, answered instantly instead of by
                  email.
                </FieldHint>
              </FieldLegend>
              <Field orientation="horizontal" className="max-w-2xl">
                <FieldContent>
                  <FieldTitle>Everything {organization.name} holds about you</FieldTitle>
                  <FieldDescription>
                    One JSON file: your profile, group memberships, payments, the documents
                    you accepted, and the emails sent to you.
                  </FieldDescription>
                </FieldContent>
                <MemberDataExportButton mode="self" />
              </Field>
            </FieldSet>

            {rosterOptOut ? <RosterOptOutField hidden={rosterOptOut.hidden} /> : null}

            <FieldSet>
              <FieldLegend className="flex items-center gap-2">Documents you accepted</FieldLegend>
              <Link
                href="/portal/legal"
                className="group -mx-2 flex max-w-2xl items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
              >
                <ScaleIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    Terms and privacy policy
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Read the current versions and when you accepted them.
                  </span>
                </span>
                <ArrowRightIcon
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground/0 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground"
                />
              </Link>
            </FieldSet>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * The member's side of `organization.showGroupRosters`: one switch, saved on
 * change like the email preference above. Leadership is not covered — a
 * leader stays listed as one; that is the organization's role, not the
 * member's data.
 */
function RosterOptOutField({ hidden }: { hidden: boolean }) {
  const t = useDictionary().portalGroupPage;
  const router = useRouter();
  const [checked, setChecked] = useState(hidden);
  const action = useAction(setHideFromGroupRostersAction, {
    onSuccess() {
      toast.success(t.hideFromRostersSaved);
      router.refresh();
    },
    onError({ error }) {
      setChecked(hidden);
      toast.error(error.serverError ?? t.failed);
    },
  });

  return (
    <FieldSet>
      <FieldLegend className="flex items-center gap-2">Group rosters</FieldLegend>
      <div className="max-w-2xl">
        <SwitchChoiceField
          id="hide-from-group-rosters"
          title={t.hideFromRosters}
          description={t.hideFromRostersDescription}
          checked={checked}
          disabled={action.isPending}
          onCheckedChange={(next) => {
            setChecked(next);
            action.execute({ hidden: next });
          }}
        />
      </div>
    </FieldSet>
  );
}
