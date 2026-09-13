"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { CopyIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { useDictionary } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RsvpOpenResult } from "@/lib/events/rsvp";
import { respondAsGuestAction } from "@/server/actions/events";
import type { EventRsvpAnswer, EventRsvpStanding } from "@/server/db/schema";

/**
 * Anonymous RSVP on a public event: name, email, answer, guests. On success
 * the guest is shown a personal link (token) so they can change their answer
 * later — no email is sent, so the link must be shown here or it is lost.
 */
export function GuestRsvpForm({
  eventSlug,
  open,
  maxGuests,
  rsvpBaseUrl,
}: {
  eventSlug: string;
  open: RsvpOpenResult;
  maxGuests: number;
  /** Absolute `/events/rsvp/` prefix; the token is appended client-side. */
  rsvpBaseUrl: string;
}) {
  const t = useDictionary().events;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [answer, setAnswer] = useState<EventRsvpAnswer | null>(null);
  const [guestCount, setGuestCount] = useState(0);
  const [done, setDone] = useState<{ standing: EventRsvpStanding; token: string } | null>(null);

  const respond = useAction(respondAsGuestAction);

  if (!open.open) {
    return <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{t.closed[open.reason]}</div>;
  }

  if (done) {
    const link = `${rsvpBaseUrl}${done.token}`;
    return (
      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <p className="text-sm font-medium">{t.public.thanks}</p>
        {answer === "yes" ? <p className="text-sm">{t.standing[done.standing]}</p> : null}
        <p className="text-sm text-muted-foreground">{t.public.changeLater}</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs">{link}</code>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast.success(t.public.linkCopied);
              } catch {
                toast.error(t.errors.generic);
              }
            }}
          >
            <CopyIcon data-icon="inline-start" />
            {t.public.copyLink}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!answer) return;
        const result = await respond.executeAsync({
          eventSlug,
          name,
          email,
          answer,
          guestCount: answer === "yes" ? guestCount : 0,
        });
        if (result?.data?.success) {
          setDone({ standing: result.data.standing, token: result.data.token });
          return;
        }
        const code = (result?.serverError ?? "generic") as keyof typeof t.errors;
        toast.error(t.errors[code] ?? t.errors.generic);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="guest-name">{t.public.yourName}</FieldLabel>
          <FieldContent>
            <Input id="guest-name" required minLength={2} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="guest-email">{t.public.yourEmail}</FieldLabel>
          <FieldContent>
            <Input id="guest-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <FieldDescription>{t.public.emailHint}</FieldDescription>
          </FieldContent>
        </Field>
      </div>

      <Field>
        <FieldLabel>{t.yourAnswer}</FieldLabel>
        <FieldContent>
          <ToggleGroup
            type="single"
            variant="outline"
            value={answer ?? ""}
            onValueChange={(value: string) => {
              if (value) setAnswer(value as EventRsvpAnswer);
            }}
            aria-label={t.yourAnswer}
          >
            {(["yes", "maybe", "no"] as const).map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {t.answer[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldContent>
      </Field>

      {maxGuests > 0 && answer === "yes" ? (
        <Field>
          <FieldLabel htmlFor="guest-guests">{t.guests}</FieldLabel>
          <FieldContent>
            <Input
              id="guest-guests"
              type="number"
              min={0}
              max={maxGuests}
              className="w-24"
              value={guestCount}
              onChange={(e) => setGuestCount(Math.max(0, Math.min(maxGuests, Number(e.target.value) || 0)))}
            />
            <FieldDescription>{t.guestsHint(maxGuests)}</FieldDescription>
          </FieldContent>
        </Field>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <a href="/login" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
          {t.public.signInHint}
        </a>
        <Button type="submit" disabled={!answer || respond.isPending}>
          {respond.isPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
          {t.submit}
        </Button>
      </div>
    </form>
  );
}
