"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { optionalNotificationEmailSchema } from "@/lib/notifications";
import { saveEmailNotificationSettingsAction } from "@/server/actions/organization-settings";

export type EmailNotificationSettingsState = {
  emailNotifyRenewalHeadsup: boolean;
  emailNotifyRenewalHeadsupDaysBefore: number;
  emailNotifyOverdue: boolean;
  emailNotifyPaymentConfirmed: boolean;
  emailNotifyReportReminder: boolean;
  emailNotifyRegistration: boolean;
  emailNotifyRegistrationOrgAdmins: boolean;
  registrationNotificationEmail: string | null;
};

export function EmailNotificationSettingsCard({
  state,
}: {
  state: EmailNotificationSettingsState;
}) {
  const router = useRouter();

  const [notifyRenewalHeadsup, setNotifyRenewalHeadsup] = useState(state.emailNotifyRenewalHeadsup);
  const [headsupDaysBefore, setHeadsupDaysBefore] = useState(state.emailNotifyRenewalHeadsupDaysBefore);
  const [notifyOverdue, setNotifyOverdue] = useState(state.emailNotifyOverdue);
  const [notifyPaymentConfirmed, setNotifyPaymentConfirmed] = useState(state.emailNotifyPaymentConfirmed);
  const [notifyReportReminder, setNotifyReportReminder] = useState(
    state.emailNotifyReportReminder,
  );
  const [notifyRegistration, setNotifyRegistration] = useState(state.emailNotifyRegistration);
  const [notifyRegistrationOrgAdmins, setNotifyRegistrationOrgAdmins] = useState(
    state.emailNotifyRegistrationOrgAdmins,
  );
  const [registrationEmail, setRegistrationEmail] = useState(
    state.registrationNotificationEmail ?? "",
  );

  // Validated here rather than only on the server so an admin is not told about
  // a typo after a round trip that also saved four unrelated toggles.
  const registrationEmailError = optionalNotificationEmailSchema.safeParse(registrationEmail)
    .success
    ? null
    : "Enter a valid email address.";

  const saveAction = useAction(saveEmailNotificationSettingsAction, {
    onSuccess() {
      toast.success("Notification settings saved.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save notification settings.");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Automated emails
      </p>

      <div className="flex flex-col gap-4 rounded-xl border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Renewal head-up</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Notify members before their renewal window opens so they can prepare payment.
            </p>
          </div>
          <Switch
            checked={notifyRenewalHeadsup}
            onCheckedChange={setNotifyRenewalHeadsup}
            aria-label="Enable renewal head-up email"
          />
        </div>

        {notifyRenewalHeadsup && (
          <Field>
            <FieldLabel htmlFor="headsup-days">Days before renewal</FieldLabel>
            <FieldContent>
              <Input
                id="headsup-days"
                type="number"
                min={1}
                max={30}
                value={headsupDaysBefore}
                onChange={(e) => setHeadsupDaysBefore(Number(e.target.value))}
                className="w-24"
              />
              <FieldDescription>How many days before the renewal date to send the email (1–30).</FieldDescription>
            </FieldContent>
          </Field>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Overdue reminder</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Send a reminder to members when their payment becomes overdue.
            </p>
          </div>
          <Switch
            checked={notifyOverdue}
            onCheckedChange={setNotifyOverdue}
            aria-label="Enable overdue reminder email"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Payment receipt</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Send a confirmation email to members when an admin marks their payment as paid.
            </p>
          </div>
          <Switch
            checked={notifyPaymentConfirmed}
            onCheckedChange={setNotifyPaymentConfirmed}
            aria-label="Enable payment receipt email"
          />
        </div>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Admin alerts
      </p>

      <div className="flex flex-col gap-2 rounded-xl border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Report confirmation reminders</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Remind group admins who have not submitted their yearly report at
              14, 7 and 1 days before the deadline, then weekly once it passes.
              The board gets a summary of who is still outstanding. Only sent
              when a confirmation deadline is set in Membership settings.
            </p>
          </div>
          <Switch
            checked={notifyReportReminder}
            onCheckedChange={setNotifyReportReminder}
            aria-label="Enable yearly report reminders"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">New application</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Send an alert when someone applies to join. Which group and
              category admins are included is set per category.
            </p>
          </div>
          <Switch
            checked={notifyRegistration}
            onCheckedChange={setNotifyRegistration}
            aria-label="Enable new application alert"
          />
        </div>

        {notifyRegistration && (
          <div className="flex items-start justify-between gap-4 border-l-2 pl-4">
            <div>
              <p className="text-sm font-medium">Include all organization admins</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Every org admin is emailed about every application. Turn this off
                to leave applications to the group admins who handle them.
              </p>
            </div>
            <Switch
              checked={notifyRegistrationOrgAdmins}
              onCheckedChange={setNotifyRegistrationOrgAdmins}
              aria-label="Email all organization admins about new applications"
            />
          </div>
        )}

        {notifyRegistration && !notifyRegistrationOrgAdmins && !registrationEmail.trim() && (
          <p className="text-sm text-muted-foreground border-l-2 pl-4">
            Nobody is notified unless a category opts in below, or you add a
            shared address.
          </p>
        )}

        {notifyRegistration && (
          <Field data-invalid={registrationEmailError !== null}>
            <FieldLabel htmlFor="registration-notification-email">
              Shared address
            </FieldLabel>
            <FieldContent>
              <Input
                id="registration-notification-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="committee@example.org"
                value={registrationEmail}
                onChange={(e) => setRegistrationEmail(e.target.value)}
                aria-invalid={registrationEmailError !== null}
                aria-describedby="registration-notification-email-description"
                className="max-w-sm"
              />
              <FieldDescription id="registration-notification-email-description">
                {registrationEmailError ??
                  "Optional. A committee mailbox or mailing list that is emailed alongside the admins."}
              </FieldDescription>
            </FieldContent>
          </Field>
        )}
      </div>


      <div>
        <Button
          onClick={() =>
            saveAction.execute({
              emailNotifyRenewalHeadsup: notifyRenewalHeadsup,
              emailNotifyRenewalHeadsupDaysBefore: headsupDaysBefore,
              emailNotifyOverdue: notifyOverdue,
              emailNotifyPaymentConfirmed: notifyPaymentConfirmed,
              emailNotifyReportReminder: notifyReportReminder,
              emailNotifyRegistration: notifyRegistration,
              emailNotifyRegistrationOrgAdmins: notifyRegistrationOrgAdmins,
              registrationNotificationEmail: registrationEmail,
            })
          }
          disabled={saveAction.isPending || registrationEmailError !== null}
        >
          {saveAction.isPending ? "Saving…" : "Save notification settings"}
        </Button>
      </div>
    </div>
  );
}
