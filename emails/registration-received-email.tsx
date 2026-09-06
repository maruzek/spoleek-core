import * as React from "react";
import {
  Body,
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
import { getDictionary } from "@/lib/i18n";

type RegistrationReceivedEmailProps = {
  organizationName: string;
  applicantName: string;
  submittedAt: string;
  /** Groups the applicant picked, grouped by the category they came from. */
  selections: Array<{ categoryName: string; groupNames: string[] }>;
  termsLabel: string;
  privacyLabel: string;
  policyVersion: string;
};

export function RegistrationReceivedEmail({
  organizationName,
  applicantName,
  submittedAt,
  selections,
  termsLabel,
  privacyLabel,
  policyVersion,
}: RegistrationReceivedEmailProps) {
  const t = getDictionary();
  const copy = t.emails.received;
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
                {copy.body(organizationName, submittedAt)}
              </Text>
            </Section>

            {selections.length > 0 ? (
              <Section className="mt-[24px] rounded-[16px] border border-[#dfe7e3] bg-[#f7fbf9] px-[24px] py-[20px]">
                <Text className="m-0 text-[12px] uppercase tracking-[2px] text-[#4a6b5e]">
                  {copy.selectionsTitle}
                </Text>
                {selections.map((selection) => (
                  <Text
                    key={selection.categoryName}
                    className="m-0 mt-[8px] text-[14px] leading-[22px] text-[#52605a]"
                  >
                    {selection.categoryName}:{" "}
                    <strong className="text-ink">{selection.groupNames.join(", ")}</strong>
                  </Text>
                ))}
              </Section>
            ) : null}

            <Section className="mt-[24px] rounded-[16px] border border-[#e2e6e4] px-[24px] py-[20px]">
              <Text className="m-0 text-[12px] uppercase tracking-[2px] text-[#52605a]">
                {copy.agreedTitle}
              </Text>
              <Text className="m-0 mt-[8px] text-[14px] leading-[22px] text-[#52605a]">
                {copy.agreedBody(termsLabel, privacyLabel, submittedAt)}
              </Text>
              <Hr className="my-[14px] border-[#e2e6e4]" />
              <Text className="m-0 text-[13px] leading-[20px] text-[#52605a]">
                {copy.versionNote(policyVersion)}
              </Text>
            </Section>

            <Section className="mt-[24px]">
              <Text className="m-0 text-[13px] leading-[22px] text-[#52605a]">
                {copy.notYou(organizationName)}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

RegistrationReceivedEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  applicantName: "Alex Applicant",
  submittedAt: "September 3, 2026",
  selections: [
    { categoryName: "Region", groupNames: ["Prague"] },
    { categoryName: "Activities", groupNames: ["Hiking", "Climbing"] },
  ],
  termsLabel: "Membership terms",
  privacyLabel: "Privacy policy",
  policyVersion: "v1",
} satisfies RegistrationReceivedEmailProps;

export default RegistrationReceivedEmail;
