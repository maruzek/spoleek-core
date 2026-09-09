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

/**
 * Tells a member their membership has ended and what happens next.
 *
 * The Workspace block is the reason this email has to exist at all. A deleted
 * member is signed out of Spoleek immediately, so the app can no longer tell
 * them anything — and their Google account keeps working for the whole grace
 * window precisely so they can take their own mail, files and photos with them.
 * A window nobody is told about is not a window.
 *
 * `workspaceEmail` is null for a member who never had one, and the whole
 * section is omitted rather than rendered with a hedge.
 */
type MembershipDeletedEmailProps = {
  organizationName: string;
  memberName: string;
  deletedAt: string;
  /** The date the record — and the Workspace account — are erased. */
  purgeAfter: string;
  workspaceEmail: string | null;
  contactEmail: string | null;
};

export function MembershipDeletedEmail({
  organizationName,
  memberName,
  deletedAt,
  purgeAfter,
  workspaceEmail,
  contactEmail,
}: MembershipDeletedEmailProps) {
  const t = getDictionary();
  const copy = t.emails.membershipDeleted;
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
                {copy.greeting(memberName)}
              </Text>
              <Text className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink">
                {copy.body(organizationName, deletedAt)}
              </Text>
            </Section>

            {workspaceEmail ? (
              <Section className="mt-[24px] rounded-[16px] border border-[#e2e6e4] bg-[#f8f9f9] px-[24px] py-[20px]">
                <Text className="m-0 text-[12px] uppercase tracking-[2px] text-[#52605a]">
                  {copy.workspaceTitle}
                </Text>
                <Text className="m-0 mt-[8px] text-[15px] leading-[26px] text-ink">
                  {copy.workspace(workspaceEmail, purgeAfter)}
                </Text>
                <Text className="m-0 mt-[12px] text-[15px] leading-[26px] text-ink">
                  {copy.workspaceHowTo}
                </Text>
                <Text className="m-0 mt-[12px] text-[15px] leading-[26px] font-semibold text-ink">
                  {copy.workspaceEnds(purgeAfter)}
                </Text>
              </Section>
            ) : null}

            <Section className="mt-[24px]">
              <Text className="m-0 text-[12px] uppercase tracking-[2px] text-[#52605a]">
                {copy.recordTitle}
              </Text>
              <Text className="m-0 mt-[8px] text-[14px] leading-[24px] text-[#52605a]">
                {copy.record(purgeAfter)}
                {contactEmail ? <> {copy.contact(contactEmail)}</> : null}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

MembershipDeletedEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  memberName: "Alex Member",
  deletedAt: "September 9, 2026",
  purgeAfter: "October 9, 2026",
  workspaceEmail: "alex.member@example.org",
  contactEmail: "info@example.org",
} satisfies MembershipDeletedEmailProps;

export default MembershipDeletedEmail;
