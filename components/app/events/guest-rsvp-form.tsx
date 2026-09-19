"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon, CopyIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { AnswerTiles, GuestStepper } from "@/components/app/events/event-rsvp-parts";
import { useDictionary } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { FieldHint } from "@/components/ui/field-hint";
import { Input } from "@/components/ui/input";
import type { RsvpOpenResult } from "@/lib/events/rsvp";
import { cn } from "@/lib/utils";
import { respondAsGuestAction } from "@/server/actions/events";
import type { EventRsvpAnswer, EventRsvpStanding } from "@/server/db/schema";

/**
 * Anonymous RSVP on a public event: answer first, then name and email, then
 * guests. On success the guest is shown a personal link (token) so they can
 * change their answer later — no email is sent, so the link must be shown
 * here or it is lost.
 */
export function GuestRsvpForm({
  eventSlug,
  open,
  maxGuests,
  priced,
  rsvpBaseUrl,
  afterRsvpForm,
}: {
  eventSlug: string;
  open: RsvpOpenResult;
  maxGuests: number;
  /** A confirmed yes creates a payment; the thank-you then points at the link and email. */
  priced: boolean;
  /** Absolute `/events/rsvp/` prefix; the token is appended client-side. */
  rsvpBaseUrl: string;
  /** An open `after_rsvp` form; the guest is sent to it on their new token. */
  afterRsvpForm?: { id: string; title: string; required: boolean } | null;
}) {
  const dict = useDictionary();
  const t = dict.events;
  const tf = dict.forms;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [answer, setAnswer] = useState<EventRsvpAnswer | null>(null);
  const [guestCount, setGuestCount] = useState(0);
  const [done, setDone] = useState<{ standing: EventRsvpStanding; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const respond = useAction(respondAsGuestAction);

  if (!open.open) {
    return <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{t.closed[open.reason]}</p>;
  }

  if (done) {
    const link = `${rsvpBaseUrl}${done.token}`;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CheckIcon className="size-4" aria-hidden />
          </span>
          <p className="font-medium text-lg text-foreground">{t.public.thanks}</p>
        </div>
        {answer === "yes" ? (
          <p className={cn("text-sm", done.standing === "confirmed" ? "text-primary" : "text-amber-700 dark:text-amber-400")}>
            {t.standing[done.standing]}
          </p>
        ) : null}
        {priced && answer === "yes" && done.standing === "confirmed" ? (
          <p className="text-sm text-muted-foreground">{t.detail.payment.guestPrompt}</p>
        ) : null}
        {afterRsvpForm ? (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-500">{tf.event.inlineTitle}</p>
            <p className="text-sm text-muted-foreground">{afterRsvpForm.required ? tf.event.dialogRequired : tf.event.inlineHint}</p>
            <Button asChild size="sm">
              <Link href={`/events/rsvp/${done.token}/forms/${afterRsvpForm.id}`}>
                {tf.public.fillAfterRsvp(afterRsvpForm.title)}
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">{t.public.changeLater}</p>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-1 pl-2.5">
          <code className="min-w-0 flex-1 truncate font-mono text-xs">{link}</code>
          <Button
            size="sm"
            variant={copied ? "outline" : "default"}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                toast.success(t.public.linkCopied);
              } catch {
                toast.error(t.errors.generic);
              }
            }}
          >
            {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
            {t.public.copyLink}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
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
      <div className="flex flex-col gap-1">
        <p className="font-medium text-lg text-foreground">{t.detail.answerPrompt}</p>
      </div>

      <AnswerTiles value={answer} onChange={setAnswer} />

      {maxGuests > 0 && answer === "yes" ? <GuestStepper value={guestCount} max={maxGuests} onChange={setGuestCount} /> : null}

      <div className="flex flex-col gap-3 border-t pt-4">
        <Field>
          <FieldLabel htmlFor="guest-name">{t.public.yourName}</FieldLabel>
          <FieldContent>
            <Input
              id="guest-name"
              required
              minLength={2}
              maxLength={200}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="guest-email" className="flex items-center gap-1.5">
            {t.public.yourEmail}
            <FieldHint>{t.public.emailHint}</FieldHint>
          </FieldLabel>
          <FieldContent>
            <Input
              id="guest-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FieldContent>
        </Field>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={!answer || respond.isPending}>
        {respond.isPending ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
        {t.submit}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {t.public.signInPrompt}{" "}
        <a href="/login" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
          {t.public.signInLink}
        </a>{" "}
        {t.public.signInSuffix}
      </p>
    </form>
  );
}
