import * as React from "react";
import { Column, Heading, Hr, Img, Row, Section, Text } from "react-email";
import { formatBankAccount } from "@/lib/iban";

export type ActivationPaymentDetails = {
  title: string;
  amount: string;
  /** Canonical IBAN as stored; rendered as local format + IBAN. */
  bankAccount: string | null;
  variableSymbol: string | null;
  dueDate: string;
  periodLabel: string;
  sourceGroupName: string | null;
  qrUrl: string | null;
};

/**
 * Detail rows are plain two-column tables rather than flex/grid: Outlook's Word
 * rendering engine ignores modern layout, and these values (IBAN, variable
 * symbol) are the ones a member must be able to read to pay at all.
 */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Row className="mb-[8px]">
      <Column className="w-[45%] align-top">
        <Text className="m-0 text-[14px] leading-[22px] text-[#52605a]">
          {label}
        </Text>
      </Column>
      <Column className="align-top">
        <Text className="m-0 text-[14px] font-semibold leading-[22px] text-ink">
          {value}
        </Text>
      </Column>
    </Row>
  );
}

/**
 * Shared membership-fee block. Both approval emails end up here — the
 * email/password activation email and the Google Workspace welcome email —
 * because which one a member receives depends on the org's auth strategy, not
 * on whether they owe a fee.
 */
export function PaymentDetailsSection({
  payment,
}: {
  payment: ActivationPaymentDetails;
}) {
  const account = payment.bankAccount
    ? formatBankAccount(payment.bankAccount)
    : null;

  return (
    <Section className="rounded-[20px] bg-surface px-[24px] py-[24px]">
      <Text className="m-0 text-[12px] uppercase tracking-[2px] text-brand">
        Membership fee
      </Text>
      <Heading
        as="h2"
        className="mb-[4px] mt-[8px] text-[20px] leading-[28px] font-semibold text-ink"
      >
        {payment.title}
      </Heading>
      <Text className="m-0 mb-[16px] text-[14px] leading-[22px] text-[#52605a]">
        {payment.sourceGroupName
          ? `This is the fee set for ${payment.sourceGroupName}. Please pay by ${payment.dueDate}.`
          : `Please pay by ${payment.dueDate} to complete your membership.`}
      </Text>

      <DetailRow label="Amount" value={payment.amount} />
      <DetailRow label="Due date" value={payment.dueDate} />
      {account ? (
        <>
          <DetailRow label="Bank account" value={account.primary} />
          {account.secondary ? (
            <DetailRow label="IBAN" value={account.secondary} />
          ) : null}
        </>
      ) : null}
      {payment.variableSymbol ? (
        <DetailRow label="Variable symbol" value={payment.variableSymbol} />
      ) : null}

      {payment.qrUrl ? (
        <>
          <Hr className="my-[20px] border-[#e2dbcd]" />
          <Section className="text-center">
            <Img
              src={payment.qrUrl}
              alt={`Payment QR code for ${payment.amount}`}
              width="180"
              height="180"
              className="mx-auto rounded-[12px] bg-white p-[8px]"
            />
            <Text className="m-0 mt-[12px] text-[13px] leading-[20px] text-[#52605a]">
              Scan with your banking app to pay. If the code does not appear,
              use the account details above.
            </Text>
          </Section>
        </>
      ) : (
        <Text className="m-0 mt-[12px] text-[13px] leading-[20px] text-[#52605a]">
          Bank details will follow separately — no account has been configured
          for this fee yet.
        </Text>
      )}
    </Section>
  );
}

export const previewPaymentDetails: ActivationPaymentDetails = {
  title: "Membership payment for 2026",
  amount: "100.00 CZK",
  bankAccount: "CZ6508000000192000145399",
  variableSymbol: "20260042",
  dueDate: "1 October 2026",
  periodLabel: "2026",
  sourceGroupName: "Senior Scouts",
  qrUrl: "https://example.com/api/payments/qr/token",
};
