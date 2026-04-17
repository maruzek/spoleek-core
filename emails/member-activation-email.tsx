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

type MemberActivationEmailProps = {
  organizationName: string;
  subject: string;
  body: string;
  activationUrl: string;
  memberName: string;
};

export function MemberActivationEmail({
  organizationName,
  subject,
  body,
  activationUrl,
  memberName,
}: MemberActivationEmailProps) {
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
                Your membership has been approved
              </Heading>
              <Text className="m-0 text-[16px] leading-[28px] text-ink">
                Hello {memberName},
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
                Create password and finish setup
              </Button>
            </Section>

            <Section>
              <Text className="m-0 text-[14px] leading-[24px] text-[#52605a]">
                This link expires in 1 hour. If it stops working, ask an administrator to send a
                fresh invitation.
              </Text>
              <Text className="m-0 mt-[16px] text-[14px] leading-[24px] text-[#52605a]">
                If the button does not open, paste this URL into your browser:
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
} satisfies MemberActivationEmailProps;

export default MemberActivationEmail;
