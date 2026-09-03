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
  const subject = `Your application to ${organizationName}`;

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
                About your application
              </Heading>
              <Text className="m-0 text-[16px] leading-[28px] text-ink">
                Hello {applicantName},
              </Text>
              <Text className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink">
                Thank you for your interest in {organizationName}. Your membership application was
                reviewed on {decidedAt} and we are not able to accept it at this time.
              </Text>
            </Section>

            {reason ? (
              <Section className="mt-[24px] rounded-[16px] border border-[#e2e6e4] bg-[#f8f9f9] px-[24px] py-[20px]">
                <Text className="m-0 text-[12px] uppercase tracking-[2px] text-[#52605a]">
                  From the reviewer
                </Text>
                <Text className="m-0 mt-[8px] text-[15px] leading-[26px] text-ink">{reason}</Text>
              </Section>
            ) : null}

            <Section className="mt-[24px]">
              <Text className="m-0 text-[14px] leading-[24px] text-[#52605a]">
                Your application and everything you submitted with it have been deleted. All we
                keep is a record of this message. You are welcome to apply again later if your
                circumstances change.
                {contactEmail ? (
                  <>
                    {" "}
                    If you have questions about this decision, write to{" "}
                    <strong className="text-ink">{contactEmail}</strong>.
                  </>
                ) : null}
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
