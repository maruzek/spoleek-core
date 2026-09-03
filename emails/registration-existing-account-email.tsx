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

type RegistrationExistingAccountEmailProps = {
  organizationName: string;
  memberName: string;
  submittedAt: string;
  signInUrl: string;
};

/**
 * Sent instead of an acknowledgement when the address on a join form already
 * belongs to a member. The join form itself says nothing either way, so this
 * email is the only place the fact appears — and it goes to the address's owner,
 * never to whoever filled in the form.
 */
export function RegistrationExistingAccountEmail({
  organizationName,
  memberName,
  submittedAt,
  signInUrl,
}: RegistrationExistingAccountEmailProps) {
  const subject = `You are already a member of ${organizationName}`;

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
                You already have a membership
              </Heading>
              <Text className="m-0 text-[16px] leading-[28px] text-ink">
                Hello {memberName},
              </Text>
              <Text className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink">
                A join form was submitted with this email address on {submittedAt}, but it is
                already registered with {organizationName}. No new application was created and
                nothing about your membership has changed.
              </Text>
            </Section>

            <Section className="mt-[28px]">
              <Button
                href={signInUrl}
                className="rounded-[12px] bg-brand px-[24px] py-[12px] text-[15px] font-semibold text-white"
              >
                Sign in instead
              </Button>
            </Section>

            <Section className="mt-[24px] rounded-[16px] border border-[#e5d0a8] bg-[#fff8ed] px-[24px] py-[20px]">
              <Text className="m-0 text-[14px] leading-[24px] text-[#52605a]">
                If this was you and you cannot get in, use{" "}
                <strong className="text-ink">Forgot password</strong> on the sign-in page. If it was
                not you, someone typed your address into a public form — there is nothing to fix,
                but tell an administrator if it keeps happening.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

RegistrationExistingAccountEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  memberName: "Alex Member",
  submittedAt: "September 3, 2026",
  signInUrl: "https://example.com/auth",
} satisfies RegistrationExistingAccountEmailProps;

export default RegistrationExistingAccountEmail;
