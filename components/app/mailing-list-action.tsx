"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import type { Table as TanStackTable } from "@tanstack/react-table";
import { MailIcon } from "lucide-react";
import { toast } from "sonner";

import type { MailingListEmailType, MailingListScope } from "@/lib/mailing-list";
import { Button } from "@/components/ui/button";
import { resolveMailingListAction } from "@/server/actions/mailing-list";
import { copyToClipboard } from "@/utils/copy";

type MailingListActionProps<TRow> = {
  scope: MailingListScope;
  table: TanStackTable<TRow>;
  getMemberId: (row: TRow) => string;
  label?: string;
  emailTypeOptions?: readonly MailingListEmailType[];
};

function buildSuccessMessage(args: {
  copiedCount: number;
  resolvedCount: number;
  skippedNoEmailCount: number;
  dedupedCount: number;
}) {
  const parts = [`Copied ${args.copiedCount} email${args.copiedCount === 1 ? "" : "s"}`];

  if (args.resolvedCount !== args.copiedCount) {
    parts.push(`from ${args.resolvedCount} accessible member${args.resolvedCount === 1 ? "" : "s"}`);
  }

  if (args.skippedNoEmailCount > 0) {
    parts.push(
      `${args.skippedNoEmailCount} without personal email skipped`,
    );
  }

  if (args.dedupedCount > 0) {
    parts.push(
      `${args.dedupedCount} duplicate${args.dedupedCount === 1 ? "" : "s"} collapsed`,
    );
  }

  return `${parts.join(", ")}.`;
}

export function MailingListAction<TRow>({
  scope,
  table,
  getMemberId,
  label = "Copy emails",
  emailTypeOptions = ["personal"],
}: MailingListActionProps<TRow>) {
  const mailingListAction = useAction(resolveMailingListAction);

  const handleCopy = useCallback(async () => {
    const selectedMemberIds = table
      .getSelectedRowModel()
      .rows.map((row) => getMemberId(row.original));

    const result = await mailingListAction.executeAsync({
      scope,
      selectedMemberIds,
      emailType: emailTypeOptions[0] ?? "personal",
    });

    if (result?.serverError) {
      toast.error(result.serverError);
      return;
    }

    if (!result?.data) {
      toast.error("Could not prepare the mailing list.");
      return;
    }

    if (result.data.copiedCount === 0 || result.data.copiedText.length === 0) {
      toast.error("No personal emails were available to copy.");
      return;
    }

    const copied = await copyToClipboard(result.data.copiedText);

    if (!copied) {
      toast.error("Could not copy the mailing list.");
      return;
    }

    toast.success(
      buildSuccessMessage({
        copiedCount: result.data.copiedCount,
        resolvedCount: result.data.resolvedCount,
        skippedNoEmailCount: result.data.skippedNoEmailCount,
        dedupedCount: result.data.dedupedCount,
      }),
    );
  }, [emailTypeOptions, getMemberId, mailingListAction, scope, table]);

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void handleCopy()}
      disabled={mailingListAction.isPending}
    >
      <MailIcon data-icon="inline-start" />
      {mailingListAction.isPending ? "Preparing..." : label}
    </Button>
  );
}
