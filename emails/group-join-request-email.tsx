import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "react-email";
import { getDictionary } from "@/lib/i18n";

type GroupJoinRequestEmailProps = {
  organizationName: string;
  memberName: string;
  memberEmail: string;
  groupName: string;
  requestedAt: string;
  /** The member's note. Omitted entirely when they gave none. */
  message: string | null;
  reviewUrl: string;
};

export function GroupJoinRequestEmail({
  organizationName,
  memberName,
  memberEmail,
  groupName,
  requestedAt,
  message,
  reviewUrl,
}: GroupJoinRequestEmailProps) {
  const t = getDictionary();
  const copy = t.emails.joinRequest;
  const subject = copy.subject(memberName, groupName);

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
            <Section>
              <Text className="m-0 text-[12px] uppercase tracking-[2px] text-brand">
                {organizationName}
              </Text>
              <Heading className="mb-[16px] mt-[12px] text-[30px] leading-[36px] font-semibold text-ink">
                {copy.heading}
              </Heading>
              <Text className="m-0 text-[16px] leading-[28px] text-ink">
                {copy.body(memberName, groupName, requestedAt)}
              </Text>
              <Text className="m-0 mt-[8px] text-[14px] leading-[24px] text-[#52605a]">
                {memberEmail}
              </Text>
            </Section>

            <Section className="mt-[24px] rounded-[16px] border border-[#e2e6e4] bg-[#f8f9f9] px-[24px] py-[20px]">
              <Text className="m-0 text-[12px] uppercase tracking-[2px] text-[#52605a]">
                {copy.messageTitle}
              </Text>
              <Text className="m-0 mt-[8px] text-[15px] leading-[26px] text-ink">
                {message ?? copy.noMessage}
              </Text>
            </Section>

            <Section className="mt-[28px]">
              <Button
                href={reviewUrl}
                className="rounded-[12px] bg-brand px-[24px] py-[12px] text-[15px] font-semibold text-white"
              >
                {copy.cta}
              </Button>
            </Section>

            <Section className="mt-[24px]">
              <Text className="m-0 text-[13px] leading-[22px] text-[#52605a]">{copy.footer}</Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

GroupJoinRequestEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  memberName: "Eva Nováková",
  memberEmail: "eva@example.test",
  groupName: "Climbing",
  requestedAt: "September 17, 2026",
  message: "I climb on Tuesdays and would love to join the evening sessions.",
  reviewUrl: "https://example.org/admin/groups/cat/grp?tab=requests",
} satisfies GroupJoinRequestEmailProps;

export default GroupJoinRequestEmail;
