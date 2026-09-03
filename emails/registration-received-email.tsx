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
  const subject = `We received your application to ${organizationName}`;

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
                We have your application
              </Heading>
              <Text className="m-0 text-[16px] leading-[28px] text-ink">
                Hello {applicantName},
              </Text>
              <Text className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink">
                Thank you for applying to join {organizationName} on {submittedAt}. An
                administrator will review your application. Once it is approved you will get a
                second email with a link to set your password and finish your profile — there is
                nothing more for you to do until then.
              </Text>
            </Section>

            {selections.length > 0 ? (
              <Section className="mt-[24px] rounded-[16px] border border-[#dfe7e3] bg-[#f7fbf9] px-[24px] py-[20px]">
                <Text className="m-0 text-[12px] uppercase tracking-[2px] text-[#4a6b5e]">
                  What you selected
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
                What you agreed to
              </Text>
              <Text className="m-0 mt-[8px] text-[14px] leading-[22px] text-[#52605a]">
                You accepted the <strong className="text-ink">{termsLabel}</strong> and the{" "}
                <strong className="text-ink">{privacyLabel}</strong> on {submittedAt}.
              </Text>
              <Hr className="my-[14px] border-[#e2e6e4]" />
              <Text className="m-0 text-[13px] leading-[20px] text-[#52605a]">
                Document version <strong className="text-ink">{policyVersion}</strong>. Keep this
                email as your record — quote this version if you ever need to ask which text you
                agreed to.
              </Text>
            </Section>

            <Section className="mt-[24px]">
              <Text className="m-0 text-[13px] leading-[22px] text-[#52605a]">
                If you did not apply to {organizationName}, you can ignore this email. Nothing
                further happens without an administrator approving the application.
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
