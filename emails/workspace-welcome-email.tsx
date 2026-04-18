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

type WorkspaceWelcomeEmailProps = {
  organizationName: string;
  memberName: string;
  workspaceEmail: string;
  temporaryPassword: string;
  signInUrl: string;
};

export function WorkspaceWelcomeEmail({
  organizationName,
  memberName,
  workspaceEmail,
  temporaryPassword,
  signInUrl,
}: WorkspaceWelcomeEmailProps) {
  const subject = `Your ${organizationName} Google Workspace account is ready`;

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
                muted: "#52605a",
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
                Your organization account is ready
              </Heading>
              <Text className="m-0 text-[16px] leading-[28px] text-ink">
                Hello {memberName},
              </Text>
              <Text className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink">
                We have created a Google Workspace account for you to use with{" "}
                {organizationName}. Sign in with these credentials. You will be
                prompted to set a new password the first time you sign in.
              </Text>
            </Section>

            <Section className="mt-[24px] rounded-[16px] bg-surface px-[24px] py-[20px]">
              <Text className="m-0 text-[12px] uppercase tracking-[1.5px] text-muted">
                Email
              </Text>
              <Text className="m-0 mt-[4px] text-[16px] font-semibold text-ink">
                {workspaceEmail}
              </Text>
              <Text className="m-0 mt-[16px] text-[12px] uppercase tracking-[1.5px] text-muted">
                Temporary password
              </Text>
              <Text className="m-0 mt-[4px] font-mono text-[16px] font-semibold text-ink">
                {temporaryPassword}
              </Text>
            </Section>

            <Section className="py-[28px]">
              <Button
                href={signInUrl}
                className="box-border rounded-[16px] bg-brand px-[24px] py-[14px] text-[16px] font-semibold text-white no-underline"
              >
                Sign in to {organizationName}
              </Button>
            </Section>

            <Section>
              <Text className="m-0 text-[14px] leading-[24px] text-muted">
                On the sign-in page, choose <strong>Continue with Google</strong>
                {" "}and use the email and temporary password above. Google will
                ask you to create a new password immediately afterwards.
              </Text>
              <Text className="m-0 mt-[16px] text-[14px] leading-[24px] text-muted">
                If the button does not open, paste this URL into your browser:
              </Text>
              <Text className="m-0 mt-[8px] break-all text-[14px] leading-[24px] text-brand">
                {signInUrl}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

WorkspaceWelcomeEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  memberName: "Alex Member",
  workspaceEmail: "alex.member@spoleek.org",
  temporaryPassword: "Xy7!Qa4mNp2R",
  signInUrl: "https://example.com/auth",
} satisfies WorkspaceWelcomeEmailProps;

export default WorkspaceWelcomeEmail;
