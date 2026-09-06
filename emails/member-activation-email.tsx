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
import {
  PaymentDetailsSection,
  previewPaymentDetails,
  type ActivationPaymentDetails,
} from "./payment-details-section";


type MemberActivationEmailProps = {
  organizationName: string;
  subject: string;
  body: string;
  activationUrl: string;
  memberName: string;
  /** Omitted when the organization does not charge a membership fee. */
  payment?: ActivationPaymentDetails | null;
};


export function MemberActivationEmail({
  organizationName,
  subject,
  body,
  activationUrl,
  memberName,
  payment = null,
}: MemberActivationEmailProps) {
  // Emails render on the server, so they resolve the locale themselves.
  const t = getDictionary();

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
                {t.emails.activation.heading}
              </Heading>
              <Text className="m-0 text-[16px] leading-[28px] text-ink">
                {t.emails.activation.greeting(memberName)}
              </Text>
              {body
                .split("\n")
                .map((paragraph) => paragraph.trim())
                .filter(Boolean)
                .map((paragraph, index) => (
                  <Text
                    key={`${paragraph}-${index}`}
                    className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink"
                  >
                    {paragraph}
                  </Text>
                ))}
            </Section>

            <Section className="py-[28px]">
              <Button
                href={activationUrl}
                className="box-border rounded-[16px] bg-brand px-[24px] py-[14px] text-[16px] font-semibold text-white no-underline"
              >
                {t.emails.activation.cta}
              </Button>
            </Section>

            {payment ? <PaymentDetailsSection payment={payment} /> : null}


            <Section>
              <Text className="m-0 mt-[24px] text-[14px] leading-[24px] text-[#52605a]">
                {t.emails.activation.expiry}
              </Text>
              <Text className="m-0 mt-[16px] text-[14px] leading-[24px] text-[#52605a]">
                {t.emails.activation.fallbackIntro}
              </Text>
              <Text className="m-0 mt-[8px] break-all text-[14px] leading-[24px] text-brand">
                {activationUrl}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

MemberActivationEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  subject: "Your membership has been approved",
  body:
    "Your membership request has been approved. Use the button below to create your password and complete the remaining profile fields before signing in to the app.",
  activationUrl: "https://example.com/activate-account?member=123&token=token",
  memberName: "Alex Member",
  payment: previewPaymentDetails,
} satisfies MemberActivationEmailProps;

export default MemberActivationEmail;
