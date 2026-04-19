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

type PaymentOverdueEmailProps = {
  organizationName: string;
  memberName: string;
  periodLabel: string;
  amount: string;
  currency: string;
  dueAt: string;
  bankAccount: string | null;
  variableSymbol: string | null;
};

export function PaymentOverdueEmail({
  organizationName,
  memberName,
  periodLabel,
  amount,
  currency,
  dueAt,
  bankAccount,
  variableSymbol,
}: PaymentOverdueEmailProps) {
  const subject = `Action required: membership fee overdue — ${periodLabel}`;

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
                Membership fee overdue
              </Heading>
              <Text className="m-0 text-[16px] leading-[28px] text-ink">
                Hello {memberName},
              </Text>
              <Text className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink">
                Your membership fee payment for the <strong>{periodLabel}</strong> period was due on{" "}
                <strong>{dueAt}</strong> and has not been received yet. Please settle it as soon as
                possible.
              </Text>
            </Section>

            <Section className="mt-[24px] rounded-[16px] border border-[#e5d0a8] bg-[#fff8ed] px-[24px] py-[20px]">
              <Text className="m-0 text-[12px] uppercase tracking-[2px] text-[#a0601a]">
                Payment details
              </Text>
              <Text className="m-0 mt-[8px] text-[24px] font-semibold text-ink">
                {amount} {currency}
              </Text>
              {bankAccount ? (
                <Text className="m-0 mt-[4px] text-[14px] text-[#52605a]">
                  Bank account: {bankAccount}
                </Text>
              ) : null}
              {variableSymbol ? (
                <Text className="m-0 text-[14px] text-[#52605a]">
                  Variable symbol: <strong>{variableSymbol}</strong>
                </Text>
              ) : null}
            </Section>

            <Section className="mt-[24px]">
              <Text className="m-0 text-[14px] leading-[24px] text-[#52605a]">
                If you have already made this payment, please contact your organization administrator
                so they can confirm it in the system.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

PaymentOverdueEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  memberName: "Alex Member",
  periodLabel: "2025/2026",
  amount: "500.00",
  currency: "CZK",
  dueAt: "March 31, 2026",
  bankAccount: "CZ6508000000192000145399",
  variableSymbol: "123456",
} satisfies PaymentOverdueEmailProps;

export default PaymentOverdueEmail;
