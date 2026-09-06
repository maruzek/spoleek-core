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
import { getDictionary } from "@/lib/i18n";

type RegistrationRejectedEmailProps = {
  organizationName: string;
  applicantName: string;
  decidedAt: string;
  /** Free text an admin chose to share. Omitted entirely when they gave none. */
  reason: string | null;
  contactEmail: string | null;
};

export function RegistrationRejectedEmail({
  organizationName,
  applicantName,
  decidedAt,
  reason,
  contactEmail,
}: RegistrationRejectedEmailProps) {
  const t = getDictionary();
  const copy = t.emails.rejected;
  const subject = copy.subject(organizationName);

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
                {copy.greeting(applicantName)}
              </Text>
              <Text className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink">
                {copy.body(organizationName, decidedAt)}
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

            <Section className="mt-[24px]">
              <Text className="m-0 text-[14px] leading-[24px] text-[#52605a]">
                {copy.deleted}
                {contactEmail ? <> {copy.contact(contactEmail)}</> : null}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

RegistrationRejectedEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  applicantName: "Alex Applicant",
  decidedAt: "September 3, 2026",
  reason: "We are at capacity for the current season and are not taking new members until spring.",
  contactEmail: "info@example.org",
} satisfies RegistrationRejectedEmailProps;

export default RegistrationRejectedEmail;
