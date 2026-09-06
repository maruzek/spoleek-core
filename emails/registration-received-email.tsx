import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
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
  /**
   * What the applicant responded to, each pinned to its archived version URL.
   *
   * The link must never point at the current version: the whole purpose of the
   * record is that it survives the document being updated.
   */
  policies: Array<{ title: string; version: string; url: string }>;
};

export function RegistrationReceivedEmail({
  organizationName,
  applicantName,
  submittedAt,
  selections,
  policies,
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
                {copy.agreedBody(submittedAt)}
              </Text>
              {policies.map((policy) => (
                <Text
                  key={policy.url}
                  className="m-0 mt-[10px] text-[14px] leading-[22px]"
                >
                  <Link href={policy.url} className="text-brand underline">
                    {copy.documentLine(policy.title, policy.version)}
                  </Link>
                </Text>
              ))}
              <Hr className="my-[14px] border-[#e2e6e4]" />
              <Text className="m-0 text-[13px] leading-[20px] text-[#52605a]">
                {copy.versionNote}
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
  policies: [
    {
      title: "Membership terms",
      version: "2.0",
      url: "https://example.test/legal/terms/v/2.0",
    },
    {
      title: "Privacy policy",
      version: "1.0",
      url: "https://example.test/legal/privacy/v/1.0",
    },
  ],
} satisfies RegistrationReceivedEmailProps;

export default RegistrationReceivedEmail;
