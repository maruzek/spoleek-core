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

type MembershipReportReminderEmailProps = {
  organizationName: string;
  groupName: string;
  periodLabel: string;
  deadline: string;
  /** Negative once the deadline has passed. */
  daysLeft: number;
  memberCount: number;
  paidCount: number;
  waivedCount: number;
  reportUrl: string;
  /**
   * True when this group has no admin and the board is being told instead. The
   * wording changes from "your group" to naming the gap, because the reader is
   * not the person who was supposed to act.
   */
  toBoardFallback: boolean;
};

export function MembershipReportReminderEmail({
  organizationName,
  groupName,
  periodLabel,
  deadline,
  daysLeft,
  memberCount,
  paidCount,
  waivedCount,
  reportUrl,
  toBoardFallback,
}: MembershipReportReminderEmailProps) {
  const isOverdue = daysLeft < 0;

  const heading = toBoardFallback
    ? `${groupName} has no admin to confirm its members`
    : isOverdue
      ? `${groupName} is late confirming its ${periodLabel} members`
      : `${groupName} hasn't confirmed its ${periodLabel} members yet`;

  const timing = isOverdue
    ? `The deadline was ${deadline} — ${Math.abs(daysLeft)} ${
        Math.abs(daysLeft) === 1 ? "day" : "days"
      } ago.`
    : daysLeft === 0
      ? `The deadline is today, ${deadline}.`
      : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left — the deadline is ${deadline}.`;

  return (
    <Html lang="en">
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: {
            extend: {
              colors: {
                brand: "#176b4d",
                surface: "#f6f0e6",
                ink: "#14231d",
                alert: "#b4341f",
              },
            },
          },
        }}
      >
        <Head />
        <Body className="bg-surface py-[32px] font-sans text-ink">
          <Preview>{heading}</Preview>
          <Container className="max-w-[600px] rounded-[28px] bg-white px-[32px] py-[36px] shadow-sm">
            <Section>
              <Text className="m-0 text-[12px] uppercase tracking-[2px] text-brand">
                {organizationName}
              </Text>
              <Heading className="mb-[16px] mt-[12px] text-[30px] leading-[36px] font-semibold text-ink">
                {heading}
              </Heading>
              <Text
                className={
                  isOverdue
                    ? "m-0 text-[16px] leading-[28px] font-semibold text-alert"
                    : "m-0 text-[16px] leading-[28px] text-ink"
                }
              >
                {timing}
              </Text>
              {toBoardFallback ? (
                <Text className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink">
                  Nobody administers this group, so there is no one to remind.
                  You are receiving this as an organization admin.
                </Text>
              ) : null}
            </Section>

            <Section className="mt-[24px] rounded-[16px] border border-[#b8ddd0] bg-[#edf7f3] px-[24px] py-[20px]">
              <Text className="m-0 text-[12px] uppercase tracking-[2px] text-brand">
                Confirmed so far
              </Text>
              <Text className="m-0 mt-[8px] text-[24px] font-semibold text-ink">
                {memberCount} {memberCount === 1 ? "member" : "members"}
              </Text>
              <Text className="m-0 mt-[4px] text-[14px] text-[#52605a]">
                {paidCount} paid · {waivedCount} waived
              </Text>
            </Section>

            <Section className="mt-[28px]">
              <Button
                href={reportUrl}
                className="rounded-[12px] bg-brand px-[24px] py-[12px] text-[15px] font-semibold text-white"
              >
                Review and submit
              </Button>
            </Section>

            <Section className="mt-[24px]">
              <Text className="m-0 text-[14px] leading-[24px] text-[#52605a]">
                Members appear on the list as their fees are paid. Submitting
                locks the roster and sends it to the board — after that, anyone
                who pays late has to be added back in, so it is worth checking
                the list is complete first.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

MembershipReportReminderEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  groupName: "Praha",
  periodLabel: "2026",
  deadline: "31 March 2026",
  daysLeft: 7,
  memberCount: 34,
  paidCount: 32,
  waivedCount: 2,
  reportUrl: "https://example.org/admin/groups/kraje/praha",
  toBoardFallback: false,
} satisfies MembershipReportReminderEmailProps;

export default MembershipReportReminderEmail;
