import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "react-email";

type MembershipReportDigestEmailProps = {
  organizationName: string;
  periodLabel: string;
  deadline: string;
  /** Negative once the deadline has passed. */
  daysLeft: number;
  groupCount: number;
  submittedCount: number;
  approvedCount: number;
  memberCount: number;
  /** Groups that have not submitted, so the board knows who to chase. */
  outstandingGroups: string[];
  /** Groups waiting on the board rather than on their admins. */
  awaitingApprovalGroups: string[];
  reportUrl: string;
};

export function MembershipReportDigestEmail({
  organizationName,
  periodLabel,
  deadline,
  daysLeft,
  groupCount,
  submittedCount,
  approvedCount,
  memberCount,
  outstandingGroups,
  awaitingApprovalGroups,
  reportUrl,
}: MembershipReportDigestEmailProps) {
  const isOverdue = daysLeft < 0;
  const outstanding = groupCount - submittedCount;

  const heading =
    outstanding === 0
      ? `Every group has submitted the ${periodLabel} report`
      : `${outstanding} of ${groupCount} groups haven't submitted the ${periodLabel} report`;

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
                {isOverdue
                  ? `The deadline was ${deadline}.`
                  : daysLeft === 0
                    ? `The deadline is today, ${deadline}.`
                    : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left — the deadline is ${deadline}.`}
              </Text>
            </Section>

            <Section className="mt-[24px] rounded-[16px] border border-[#b8ddd0] bg-[#edf7f3] px-[24px] py-[20px]">
              <Text className="m-0 text-[12px] uppercase tracking-[2px] text-brand">
                Where the report stands
              </Text>
              <Text className="m-0 mt-[8px] text-[24px] font-semibold text-ink">
                {memberCount} {memberCount === 1 ? "member" : "members"}{" "}
                confirmed
              </Text>
              <Text className="m-0 mt-[4px] text-[14px] text-[#52605a]">
                {submittedCount} of {groupCount} groups submitted ·{" "}
                {approvedCount} approved
              </Text>
            </Section>

            {outstandingGroups.length > 0 ? (
              <Section className="mt-[24px]">
                <Text className="m-0 text-[12px] uppercase tracking-[2px] text-alert">
                  Still to submit
                </Text>
                <Text className="m-0 mt-[8px] text-[16px] leading-[26px] text-ink">
                  {outstandingGroups.join(", ")}
                </Text>
              </Section>
            ) : null}

            {awaitingApprovalGroups.length > 0 ? (
              <>
                <Hr className="my-[24px] border-[#e6ded1]" />
                <Section>
                  <Text className="m-0 text-[12px] uppercase tracking-[2px] text-brand">
                    Waiting for you
                  </Text>
                  <Text className="m-0 mt-[8px] text-[16px] leading-[26px] text-ink">
                    {awaitingApprovalGroups.join(", ")}
                  </Text>
                  <Text className="m-0 mt-[8px] text-[14px] leading-[24px] text-[#52605a]">
                    {awaitingApprovalGroups.length === 1 ? "This group has" : "These groups have"}{" "}
                    submitted and {awaitingApprovalGroups.length === 1 ? "needs" : "need"}{" "}
                    approving.
                  </Text>
                </Section>
              </>
            ) : null}

            <Section className="mt-[28px]">
              <Button
                href={reportUrl}
                className="rounded-[12px] bg-brand px-[24px] py-[12px] text-[15px] font-semibold text-white"
              >
                Open the report dashboard
              </Button>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

MembershipReportDigestEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  periodLabel: "2026",
  deadline: "31 March 2026",
  daysLeft: -7,
  groupCount: 12,
  submittedCount: 9,
  approvedCount: 6,
  memberCount: 340,
  outstandingGroups: ["Brno", "Ostrava", "Plzeň"],
  awaitingApprovalGroups: ["Liberec", "Olomouc", "Zlín"],
  reportUrl: "https://example.org/admin/reports",
} satisfies MembershipReportDigestEmailProps;

export default MembershipReportDigestEmail;
