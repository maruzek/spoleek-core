import * as React from "react";
import {
  Body,
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

type PaymentConfirmedEmailProps = {
  organizationName: string;
  memberName: string;
  periodLabel: string;
  amount: string;
  currency: string;
  paidAt: string;
};

export function PaymentConfirmedEmail({
  organizationName,
  memberName,
  periodLabel,
  amount,
  currency,
  paidAt,
}: PaymentConfirmedEmailProps) {
  const subject = `Payment confirmed — ${periodLabel}`;

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
                Payment confirmed
              </Heading>
              <Text className="m-0 text-[16px] leading-[28px] text-ink">
                Hello {memberName},
              </Text>
              <Text className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink">
                Your membership fee payment for the <strong>{periodLabel}</strong> period has been
                confirmed. Thank you!
              </Text>
            </Section>

            <Section className="mt-[24px] rounded-[16px] bg-[#f6f0e6] px-[24px] py-[20px]">
              <Text className="m-0 text-[12px] uppercase tracking-[2px] text-brand">
                Payment details
              </Text>
              <Text className="m-0 mt-[8px] text-[16px] font-semibold text-ink">
                {amount} {currency}
              </Text>
              <Text className="m-0 text-[14px] text-[#52605a]">
                Period: {periodLabel}
              </Text>
              <Text className="m-0 text-[14px] text-[#52605a]">
                Confirmed on: {paidAt}
              </Text>
            </Section>

            <Section className="mt-[24px]">
              <Text className="m-0 text-[14px] leading-[24px] text-[#52605a]">
                If you have any questions, please contact your organization administrator.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

PaymentConfirmedEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  memberName: "Alex Member",
  periodLabel: "2025/2026",
  amount: "500.00",
  currency: "CZK",
  paidAt: "April 19, 2026",
} satisfies PaymentConfirmedEmailProps;

export default PaymentConfirmedEmail;
