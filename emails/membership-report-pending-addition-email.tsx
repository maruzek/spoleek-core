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

type MembershipReportPendingAdditionEmailProps = {
  organizationName: string;
  groupName: string;
  periodLabel: string;
  /** How many members are waiting to be accepted onto the submitted roster. */
  pendingAdditions: number;
  /** The roster as the board has it, which these people are not part of yet. */
  memberCount: number;
  /** True once the board has approved, so accepting undoes that approval. */
  isApproved: boolean;
  reportUrl: string;
  /** True when the group has no admin and the board is being told instead. */
  toBoardFallback: boolean;
};

/**
 * Tells a group that has already submitted it has members waiting.
 *
 * Separate from the confirmation reminder because the reader's situation is the
 * opposite: they did their part, and something arrived afterwards. The deadline
 * is not mentioned — it may be long past, and it is not what this asks for.
 */
export function MembershipReportPendingAdditionEmail({
  organizationName,
  groupName,
  periodLabel,
  pendingAdditions,
  memberCount,
  isApproved,
  reportUrl,
  toBoardFallback,
}: MembershipReportPendingAdditionEmailProps) {
  const plural = pendingAdditions === 1 ? "member" : "members";

  const heading = toBoardFallback
    ? `${groupName} has ${pendingAdditions} ${plural} waiting, and no admin`
    : `${pendingAdditions} ${plural} confirmed after you submitted ${periodLabel}`;

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
              <Text className="m-0 text-[16px] leading-[28px] text-ink">
                They paid after {groupName}&rsquo;s roster was locked, so they
                are held to one side and counted in nothing. Nobody is added to
                a report you have already signed off without you saying so.
              </Text>
              {toBoardFallback ? (
                <Text className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink">
                  Nobody administers this group, so there is no one else to ask.
                  You are receiving this as an organization admin.
                </Text>
              ) : null}
            </Section>

            <Section className="mt-[24px] rounded-[16px] border border-[#b8ddd0] bg-[#edf7f3] px-[24px] py-[20px]">
              <Text className="m-0 text-[12px] uppercase tracking-[2px] text-brand">
                Waiting for you
              </Text>
              <Text className="m-0 mt-[8px] text-[24px] font-semibold text-ink">
                {pendingAdditions} {plural}
              </Text>
              <Text className="m-0 mt-[4px] text-[14px] text-[#52605a]">
                {memberCount} on the submitted roster
              </Text>
            </Section>

            <Section className="mt-[28px]">
              <Button
                href={reportUrl}
                className="rounded-[12px] bg-brand px-[24px] py-[12px] text-[15px] font-semibold text-white"
              >
                Review who is waiting
              </Button>
            </Section>

            <Section className="mt-[24px]">
              <Text className="m-0 text-[14px] leading-[24px] text-[#52605a]">
                {isApproved
                  ? "Accepting them changes numbers the board has already approved, so the report goes back for a second look. Leaving them out keeps the approved figures as they are."
                  : "Accepting them sends the report back to you and then on to the board again, with the new numbers. Leaving them out keeps the roster as you submitted it."}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

MembershipReportPendingAdditionEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  groupName: "Praha",
  periodLabel: "2026",
  pendingAdditions: 2,
  memberCount: 34,
  isApproved: false,
  reportUrl: "https://example.org/admin/groups/kraje/praha",
  toBoardFallback: false,
} satisfies MembershipReportPendingAdditionEmailProps;

export default MembershipReportPendingAdditionEmail;
