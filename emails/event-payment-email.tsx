import * as React from "react";
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "react-email";
import { formatBankAccount } from "@/lib/iban";

export type EventPaymentEmailProps = {
  organizationName: string;
  recipientName: string;
  eventTitle: string;
  /** Major units, already formatted ("350.00"). */
  amount: string;
  currency: string;
  dueAt: string;
  paymentDetails: {
    bankAccount: string | null;
    variableSymbol: string | null;
    qrUrl: string | null;
  };
  /** Portal event page for members, token page for guests. */
  link: string;
  /** True when a pending payment was re-priced (guest count changed). */
  updated: boolean;
};

export function eventPaymentEmailSubject(props: Pick<EventPaymentEmailProps, "eventTitle" | "updated">) {
  return props.updated
    ? `Updated payment for ${props.eventTitle}`
    : `Payment for ${props.eventTitle}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Row className="mb-[8px]">
      <Column className="w-[45%] align-top">
        <Text className="m-0 text-[14px] leading-[22px] text-[#52605a]">{label}</Text>
      </Column>
      <Column className="align-top">
        <Text className="m-0 text-[14px] font-semibold leading-[22px] text-ink">{value}</Text>
      </Column>
    </Row>
  );
}

/**
 * Sent when a confirmed yes on a priced event creates (or re-prices) a
 * payment. Same layout as the membership-fee emails so a member who has paid
 * a fee before recognises the block; guests get the identical mail with their
 * token page as the link.
 */
export function EventPaymentEmail({
  organizationName,
  recipientName,
  eventTitle,
  amount,
  currency,
  dueAt,
  paymentDetails,
  link,
  updated,
}: EventPaymentEmailProps) {
  const account = paymentDetails.bankAccount
    ? formatBankAccount(paymentDetails.bankAccount)
    : null;
  const subject = eventPaymentEmailSubject({ eventTitle, updated });

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
                {updated ? "Your payment was updated" : "Your place is confirmed"}
              </Heading>
              <Text className="m-0 text-[16px] leading-[28px] text-ink">Hello {recipientName},</Text>
              <Text className="m-0 mt-[16px] text-[16px] leading-[28px] text-ink">
                {updated
                  ? `The amount for ${eventTitle} changed with your answer. Here are the updated payment details.`
                  : `You are confirmed for ${eventTitle}. Please pay the fee below by ${dueAt} to keep your place.`}
              </Text>
            </Section>

            <Section className="mt-[24px] rounded-[20px] bg-surface px-[24px] py-[24px]">
              <Text className="m-0 text-[12px] uppercase tracking-[2px] text-brand">Event fee</Text>
              <Heading
                as="h2"
                className="mb-[4px] mt-[8px] text-[20px] leading-[28px] font-semibold text-ink"
              >
                {eventTitle}
              </Heading>
              <Text className="m-0 mb-[16px] text-[24px] font-semibold text-ink">
                {amount} {currency}
              </Text>

              <DetailRow label="Due date" value={dueAt} />
              {account ? (
                <>
                  <DetailRow label="Bank account" value={account.primary} />
                  {account.secondary ? <DetailRow label="IBAN" value={account.secondary} /> : null}
                </>
              ) : null}
              {paymentDetails.variableSymbol ? (
                <DetailRow label="Variable symbol" value={paymentDetails.variableSymbol} />
              ) : null}

              {paymentDetails.qrUrl ? (
                <>
                  <Hr className="my-[20px] border-[#e2dbcd]" />
                  <Section className="text-center">
                    <Img
                      src={paymentDetails.qrUrl}
                      alt={`Payment QR code for ${amount} ${currency}`}
                      width="180"
                      height="180"
                      className="mx-auto rounded-[12px] bg-white p-[8px]"
                    />
                    <Text className="m-0 mt-[12px] text-[13px] leading-[20px] text-[#52605a]">
                      Scan with your banking app to pay. If the code does not appear, use the
                      account details above.
                    </Text>
                  </Section>
                </>
              ) : null}
            </Section>

            <Section className="mt-[24px]">
              <Button
                href={link}
                className="rounded-[12px] bg-brand px-[22px] py-[12px] text-[14px] font-semibold text-white"
              >
                View event and payment
              </Button>
              <Text className="m-0 mt-[12px] text-[13px] leading-[20px] text-[#52605a]">
                The payment details stay on the event page, so you can come back to them any time.
              </Text>
              <Text className="m-0 mt-[4px] text-[13px] leading-[20px]">
                <Link href={link} className="text-brand underline">
                  {link}
                </Link>
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

EventPaymentEmail.PreviewProps = {
  organizationName: "Spoleek Scouts",
  recipientName: "Alex Member",
  eventTitle: "Summer camp 2026",
  amount: "3500.00",
  currency: "CZK",
  dueAt: "1 October 2026",
  paymentDetails: {
    bankAccount: "CZ6508000000192000145399",
    variableSymbol: "123456",
    qrUrl: "https://example.com/api/payments/qr/token",
  },
  link: "https://example.com/portal/events/summer-camp-2026",
  updated: false,
} satisfies EventPaymentEmailProps;

export default EventPaymentEmail;
