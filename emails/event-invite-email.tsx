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

type EventInviteEmailProps = {
  organizationName: string;
  recipientName: string;
  eventTitle: string;
  /** Pre-formatted in the org's locale and timezone; null when undated. */
  when: string | null;
  where: string | null;
  /** Plain-text excerpt of the description, already truncated. */
  excerpt: string | null;
  deadline: string | null;
  /** The tokenized RSVP link — personal, so the email says not to forward it. */
  rsvpUrl: string;
  communicationLink: string | null;
};

export function EventInviteEmail({
  organizationName,
  recipientName,
  eventTitle,
  when,
  where,
  excerpt,
  deadline,
  rsvpUrl,
  communicationLink,
}: EventInviteEmailProps) {
  const t = getDictionary();
  const copy = t.emails.eventInvite;
  const subject = copy.subject(organizationName, eventTitle);

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
              {copy.heading(eventTitle)}
            </Heading>

            <Text className="mt-[20px] text-[15px] leading-[24px] text-[#52605a]">
              {copy.greeting(recipientName)}
            </Text>
            <Text className="m-0 mt-[8px] text-[15px] leading-[24px] text-[#52605a]">
              {copy.body(organizationName)}
            </Text>

            {when || where ? (
              <Section className="mt-[24px] rounded-[16px] border border-[#e2e6e4] px-[24px] py-[20px]">
                {when ? (
                  <>
                    <Text className="m-0 text-[12px] uppercase tracking-[2px] text-[#52605a]">
                      {copy.whenTitle}
                    </Text>
                    <Text className="m-0 mt-[4px] text-[14px] leading-[22px] text-ink">{when}</Text>
                  </>
                ) : null}
                {where ? (
                  <>
                    <Text className={`m-0 ${when ? "mt-[12px]" : ""} text-[12px] uppercase tracking-[2px] text-[#52605a]`}>
                      {copy.whereTitle}
                    </Text>
                    <Text className="m-0 mt-[4px] text-[14px] leading-[22px] text-ink">{where}</Text>
                  </>
                ) : null}
              </Section>
            ) : null}

            {excerpt ? (
              <Text className="m-0 mt-[20px] text-[14px] leading-[22px] text-[#52605a]">
                {excerpt}
              </Text>
            ) : null}

            {deadline ? (
              <Text className="m-0 mt-[16px] text-[14px] font-semibold leading-[22px] text-ink">
                {copy.deadline(deadline)}
              </Text>
            ) : null}

            <Section className="mt-[24px]">
              <Button
                href={rsvpUrl}
                className="rounded-[12px] bg-brand px-[22px] py-[12px] text-[14px] font-semibold text-white"
              >
                {copy.rsvp}
              </Button>
              <Text className="m-0 mt-[12px] text-[13px] leading-[20px] text-[#52605a]">
                {copy.fallbackIntro}
              </Text>
              <Text className="m-0 mt-[4px] text-[13px] leading-[20px]">
                <Link href={rsvpUrl} className="text-brand underline">
                  {rsvpUrl}
                </Link>
              </Text>
            </Section>

            {communicationLink ? (
              <Section className="mt-[16px]">
                <Link href={communicationLink} className="text-[14px] text-brand underline">
                  {copy.communication}
                </Link>
              </Section>
            ) : null}

            <Hr className="my-[20px] border-[#e2e6e4]" />
            <Text className="m-0 text-[13px] leading-[20px] text-[#52605a]">{copy.keepThis}</Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

EventInviteEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  recipientName: "Alex Member",
  eventTitle: "Summer camp 2026",
  when: "July 11 – 18, 2026",
  where: "Camp Sázava, Kácov",
  excerpt: "A week under canvas for troops 1 and 2. Parents welcome on the last day.",
  deadline: "June 30, 2026",
  rsvpUrl: "https://example.test/events/rsvp/abc123",
  communicationLink: "https://chat.whatsapp.com/example",
} satisfies EventInviteEmailProps;

export default EventInviteEmail;
