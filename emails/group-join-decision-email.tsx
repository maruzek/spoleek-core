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

type GroupJoinDecisionEmailProps = {
  organizationName: string;
  memberName: string;
  groupName: string;
  decision: "approve" | "decline";
  decidedAt: string;
  /** Free text the leader chose to share. Omitted entirely when they gave none. */
  reason: string | null;
  portalUrl: string;
};

export function GroupJoinDecisionEmail({
  organizationName,
  memberName,
  groupName,
  decision,
  decidedAt,
  reason,
  portalUrl,
}: GroupJoinDecisionEmailProps) {
  const t = getDictionary();
  const copy = t.emails.joinDecision;
  const approved = decision === "approve";
  const subject = approved ? copy.approvedSubject(groupName) : copy.declinedSubject(groupName);

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
                {approved ? copy.approvedHeading : copy.declinedHeading}
              </Heading>
              <Text className="m-0 text-[16px] leading-[28px] text-ink">
                {copy.greeting(memberName)}
              </Text>
              <Text className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink">
                {approved
                  ? copy.approvedBody(groupName, organizationName, decidedAt)
                  : copy.declinedBody(groupName, organizationName, decidedAt)}
              </Text>
            </Section>

            {reason ? (
              <Section className="mt-[24px] rounded-[16px] border border-[#e2e6e4] bg-[#f8f9f9] px-[24px] py-[20px]">
                <Text className="m-0 text-[12px] uppercase tracking-[2px] text-[#52605a]">
                  {copy.reasonTitle}
                </Text>
                <Text className="m-0 mt-[8px] text-[15px] leading-[26px] text-ink">{reason}</Text>
              </Section>
            ) : null}

            <Section className="mt-[28px]">
              <Button
                href={portalUrl}
                className="rounded-[12px] bg-brand px-[24px] py-[12px] text-[15px] font-semibold text-white"
              >
                {copy.cta}
              </Button>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

GroupJoinDecisionEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  memberName: "Eva Nováková",
  groupName: "Climbing",
  decision: "decline",
  decidedAt: "September 18, 2026",
  reason: "The Tuesday sessions are full this season — try again in January.",
  portalUrl: "https://example.org/portal/groups",
} satisfies GroupJoinDecisionEmailProps;

export default GroupJoinDecisionEmail;
