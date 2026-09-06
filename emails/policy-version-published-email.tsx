import * as React from "react";
import {
  Body,
  Button,
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

type PolicyVersionPublishedEmailProps = {
  organizationName: string;
  memberName: string;
  documentTitle: string;
  version: string;
  effectiveFrom: string;
  summaryOfChanges: string;
  /**
   * The archived version URL, never `/legal/<slug>`.
   *
   * A member re-reading this email in a year must land on the text this email
   * describes, not on whatever replaced it.
   */
  versionUrl: string;
  /** Whether the member has to respond before using the portal again. */
  actionRequired: boolean;
};

export function PolicyVersionPublishedEmail({
  organizationName,
  memberName,
  documentTitle,
  version,
  effectiveFrom,
  summaryOfChanges,
  versionUrl,
  actionRequired,
}: PolicyVersionPublishedEmailProps) {
  const t = getDictionary();
  const copy = t.emails.policyPublished;
  const subject = copy.subject(organizationName, documentTitle);

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
            <Heading className="m-0 text-[24px] font-bold leading-[32px] text-ink">
              {copy.heading(documentTitle)}
            </Heading>

            <Text className="mt-[20px] text-[15px] leading-[24px] text-[#52605a]">
              {copy.greeting(memberName)}
            </Text>
            <Text className="m-0 mt-[8px] text-[15px] leading-[24px] text-[#52605a]">
              {copy.body(organizationName, documentTitle, effectiveFrom)}
            </Text>

            {summaryOfChanges ? (
              <Section className="mt-[24px] rounded-[16px] border border-[#e2e6e4] px-[24px] py-[20px]">
                <Text className="m-0 text-[12px] uppercase tracking-[2px] text-[#52605a]">
                  {copy.changesTitle}
                </Text>
                <Text className="m-0 mt-[8px] text-[14px] leading-[22px] text-[#52605a]">
                  {summaryOfChanges}
                </Text>
              </Section>
            ) : null}

            <Section className="mt-[24px]">
              <Button
                href={versionUrl}
                className="rounded-[12px] bg-brand px-[22px] py-[12px] text-[14px] font-semibold text-white"
              >
                {copy.readVersion}
              </Button>
              <Text className="m-0 mt-[12px] text-[13px] leading-[20px] text-[#52605a]">
                <Link href={versionUrl} className="text-brand underline">
                  {documentTitle} — {version}
                </Link>
              </Text>
            </Section>

            <Section className="mt-[24px]">
              <Text className="m-0 text-[14px] leading-[22px] text-[#52605a]">
                {actionRequired ? copy.actionRequired : copy.noActionRequired}
              </Text>
              <Hr className="my-[14px] border-[#e2e6e4]" />
              <Text className="m-0 text-[13px] leading-[20px] text-[#52605a]">
                {copy.keepThis}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

PolicyVersionPublishedEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  memberName: "Alex Member",
  documentTitle: "Privacy policy",
  version: "2.0",
  effectiveFrom: "September 6, 2026",
  summaryOfChanges:
    "Named the new hosting provider and the email service as data processors.",
  versionUrl: "https://example.test/legal/privacy/v/2.0",
  actionRequired: true,
} satisfies PolicyVersionPublishedEmailProps;

export default PolicyVersionPublishedEmail;
