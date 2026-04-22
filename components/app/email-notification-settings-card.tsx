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
import { saveEmailNotificationSettingsAction } from "@/server/actions/organization-settings";

export type EmailNotificationSettingsState = {
  emailNotifyRenewalHeadsup: boolean;
  emailNotifyRenewalHeadsupDaysBefore: number;
  emailNotifyOverdue: boolean;
  emailNotifyPaymentConfirmed: boolean;
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

      <div>
        <Button
          onClick={() =>
            saveAction.execute({
              emailNotifyRenewalHeadsup: notifyRenewalHeadsup,
              emailNotifyRenewalHeadsupDaysBefore: headsupDaysBefore,
              emailNotifyOverdue: notifyOverdue,
              emailNotifyPaymentConfirmed: notifyPaymentConfirmed,
            })
          }
          disabled={saveAction.isPending}
        >
          {saveAction.isPending ? "Saving…" : "Save notification settings"}
        </Button>
      </div>
    </div>
  );
}
