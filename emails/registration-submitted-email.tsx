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

type RegistrationSubmittedEmailProps = {
  organizationName: string;
  applicantName: string;
  applicantEmail: string;
  submittedAt: string;
  /** Groups the applicant picked, grouped by the category they came from. */
  selections: Array<{ categoryName: string; groupNames: string[] }>;
  reviewUrl: string;
};

export function RegistrationSubmittedEmail({
  organizationName,
  applicantName,
  applicantEmail,
  submittedAt,
  selections,
  reviewUrl,
}: RegistrationSubmittedEmailProps) {
  const subject = `New membership application — ${applicantName}`;

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
                New membership application
              </Heading>
              <Text className="m-0 text-[16px] leading-[28px] text-ink">
                <strong>{applicantName}</strong> applied to join on {submittedAt}. Their
                application is waiting for review.
              </Text>
            </Section>

            <Section className="mt-[24px] rounded-[16px] border border-[#dfe7e3] bg-[#f7fbf9] px-[24px] py-[20px]">
              <Text className="m-0 text-[12px] uppercase tracking-[2px] text-[#4a6b5e]">
                Applicant
              </Text>
              <Text className="m-0 mt-[8px] text-[18px] font-semibold text-ink">
                {applicantName}
              </Text>
              <Text className="m-0 mt-[2px] text-[14px] text-[#52605a]">{applicantEmail}</Text>

              {selections.length > 0 ? (
                <>
                  <Hr className="my-[16px] border-[#dfe7e3]" />
                  {selections.map((selection) => (
                    <Text
                      key={selection.categoryName}
                      className="m-0 mt-[6px] text-[14px] leading-[22px] text-[#52605a]"
                    >
                      {selection.categoryName}:{" "}
                      <strong className="text-ink">{selection.groupNames.join(", ")}</strong>
                    </Text>
                  ))}
                </>
              ) : null}
            </Section>

            <Section className="mt-[28px]">
              <Button
                href={reviewUrl}
                className="rounded-[12px] bg-brand px-[24px] py-[12px] text-[15px] font-semibold text-white"
              >
                Review the application
              </Button>
            </Section>

            <Section className="mt-[24px]">
              <Text className="m-0 text-[13px] leading-[22px] text-[#52605a]">
                You are receiving this because you administer this organization or one of the
                groups the applicant selected. Notification recipients are managed in the
                organization and group category settings.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

RegistrationSubmittedEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  applicantName: "Alex Applicant",
  applicantEmail: "alex@example.com",
  submittedAt: "September 3, 2026",
  selections: [
    { categoryName: "Region", groupNames: ["Prague"] },
    { categoryName: "Activities", groupNames: ["Hiking", "Climbing"] },
  ],
  reviewUrl: "https://example.com/admin/members",
} satisfies RegistrationSubmittedEmailProps;

export default RegistrationSubmittedEmail;
