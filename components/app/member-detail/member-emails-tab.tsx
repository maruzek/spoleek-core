"use client";

import { MailIcon } from "lucide-react";

import { EmailActivityTable } from "@/components/app/emails/email-activity-table";
import { EmailDetailDialog } from "@/components/app/emails/email-detail-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type {
  EmailActivityDetail,
  EmailActivityRow,
} from "@/server/queries/email-activity";

export function MemberEmailsTab({
  emails,
  selectedEmail,
  onOpenDetail,
}: {
  emails: EmailActivityRow[];
  selectedEmail: EmailActivityDetail | null;
  onOpenDetail: (emailId: string | null) => void;
}) {
  if (emails.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MailIcon />
          </EmptyMedia>
          <EmptyTitle>No emails yet</EmptyTitle>
          <EmptyDescription>
            Activation invites, approvals, and payment notices sent to this
            member will be listed here with their delivery status.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <EmailActivityTable
        activities={emails}
        scope="member"
        onOpenDetail={onOpenDetail}
      />

      <EmailDetailDialog
        activity={selectedEmail}
        open={selectedEmail != null}
        onOpenChange={(open) => {
          if (!open) {
            onOpenDetail(null);
          }
        }}
        showRelatedMember={false}
      />
    </>
  );
}
