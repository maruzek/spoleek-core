import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "react-email";
import { getDictionary } from "@/lib/i18n";

type FormReminderEmailProps = {
  organizationName: string;
  recipientName: string;
  formTitle: string;
  /** The linked event, pre-formatted; null for an unlinked form. */
  eventTitle: string | null;
  eventWhen: string | null;
  /** Pre-formatted in the org's locale; null when the form has no deadline. */
  deadline: string | null;
  /** Personal token link for externals; portal link for members. */
  formUrl: string;
  /** True when the link needs a sign-in (portal) rather than a token. */
  requiresSignIn: boolean;
};

export function FormReminderEmail({
  organizationName,
  recipientName,
  formTitle,
  eventTitle,
  eventWhen,
  deadline,
  formUrl,
  requiresSignIn,
}: FormReminderEmailProps) {
  const t = getDictionary();
  const copy = t.emails.formReminder;
  const subject = copy.subject(organizationName, formTitle);

  return (
    <Html lang={t.locale}>
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: {
            extend: {
              colors: {
                brand: "#176b4d",
                surface: "#f6f0e6",
                ink: "#14231d",
              },
            },
          },
        }}
      >
        <Head />
        <Body className="bg-surface py-[32px] font-sans text-ink">
          <Preview>{subject}</Preview>
          <Container className="max-w-[600px] rounded-[28px] bg-white px-[32px] py-[36px] shadow-sm">
            <Heading className="m-0 text-[24px] font-bold leading-[32px] text-ink">
              {copy.heading(formTitle)}
            </Heading>

            <Text className="mt-[20px] text-[15px] leading-[24px] text-[#52605a]">
              {copy.greeting(recipientName)}
            </Text>
            <Text className="m-0 mt-[8px] text-[15px] leading-[24px] text-[#52605a]">
              {copy.body(organizationName)}
            </Text>

            {eventTitle ? (
              <Section className="mt-[24px] rounded-[16px] border border-[#e2e6e4] px-[24px] py-[20px]">
                <Text className="m-0 text-[12px] uppercase tracking-[2px] text-[#52605a]">
                  {copy.eventTitle}
                </Text>
                <Text className="m-0 mt-[4px] text-[14px] leading-[22px] text-ink">{eventTitle}</Text>
                {eventWhen ? (
                  <Text className="m-0 mt-[4px] text-[14px] leading-[22px] text-[#52605a]">
                    {eventWhen}
                  </Text>
                ) : null}
              </Section>
            ) : null}

            {deadline ? (
              <Text className="m-0 mt-[16px] text-[14px] font-semibold leading-[22px] text-ink">
                {copy.deadline(deadline)}
              </Text>
            ) : null}

            <Section className="mt-[24px]">
              <Button
                href={formUrl}
                className="rounded-[12px] bg-brand px-[22px] py-[12px] text-[14px] font-semibold text-white"
              >
                {copy.open}
              </Button>
              <Text className="m-0 mt-[12px] text-[13px] leading-[20px] text-[#52605a]">
                {copy.fallbackIntro}
              </Text>
              <Text className="m-0 mt-[4px] text-[13px] leading-[20px]">
                <Link href={formUrl} className="text-brand underline">
                  {formUrl}
                </Link>
              </Text>
            </Section>

            <Hr className="my-[20px] border-[#e2e6e4]" />
            <Text className="m-0 text-[13px] leading-[20px] text-[#52605a]">
              {requiresSignIn ? copy.signIn : copy.keepThis}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

FormReminderEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  recipientName: "Alex Member",
  formTitle: "Camp registration",
  eventTitle: "Summer camp 2026",
  eventWhen: "July 11 – 18, 2026",
  deadline: "June 30, 2026",
  formUrl: "https://example.test/events/rsvp/abc123/forms/def456",
  requiresSignIn: false,
} satisfies FormReminderEmailProps;

export default FormReminderEmail;
