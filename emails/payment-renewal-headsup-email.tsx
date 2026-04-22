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

type PaymentRenewalHeadsupEmailProps = {
  organizationName: string;
  memberName: string;
  periodLabel: string;
  renewalDate: string;
  amount: string;
  currency: string;
  bankAccount: string | null;
};

export function PaymentRenewalHeadsupEmail({
  organizationName,
  memberName,
  periodLabel,
  renewalDate,
  amount,
  currency,
  bankAccount,
}: PaymentRenewalHeadsupEmailProps) {
  const subject = `Membership renewal coming up — ${periodLabel}`;

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
                Membership renewal coming up
              </Heading>
              <Text className="m-0 text-[16px] leading-[28px] text-ink">
                Hello {memberName},
              </Text>
              <Text className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink">
                Your membership renewal for the <strong>{periodLabel}</strong> period opens on{" "}
                <strong>{renewalDate}</strong>. A payment request will be sent to you at that time.
              </Text>
            </Section>

            <Section className="mt-[24px] rounded-[16px] border border-[#b8ddd0] bg-[#edf7f3] px-[24px] py-[20px]">
              <Text className="m-0 text-[12px] uppercase tracking-[2px] text-brand">
                Upcoming payment
              </Text>
              <Text className="m-0 mt-[8px] text-[24px] font-semibold text-ink">
                {amount} {currency}
              </Text>
              {bankAccount ? (
                <Text className="m-0 mt-[4px] text-[14px] text-[#52605a]">
                  Bank account: {bankAccount}
                </Text>
              ) : null}
            </Section>

            <Section className="mt-[24px]">
              <Text className="m-0 text-[14px] leading-[24px] text-[#52605a]">
                No action is needed right now. You will receive a separate email once the payment
                period opens with full payment instructions.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

PaymentRenewalHeadsupEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  memberName: "Alex Member",
  periodLabel: "2025/2026",
  renewalDate: "September 1, 2025",
  amount: "500.00",
  currency: "CZK",
  bankAccount: "CZ6508000000192000145399",
} satisfies PaymentRenewalHeadsupEmailProps;

export default PaymentRenewalHeadsupEmail;
