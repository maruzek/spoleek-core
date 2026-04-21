"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import type { Table as TanStackTable } from "@tanstack/react-table";
import { ChevronDownIcon, MailIcon } from "lucide-react";
import { toast } from "sonner";

import type { MailingListEmailType, MailingListScope } from "@/lib/mailing-list";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveMailingListAction } from "@/server/actions/mailing-list";
import { copyToClipboard } from "@/utils/copy";

type MailingListActionProps<TRow> = {
  scope: MailingListScope;
  table: TanStackTable<TRow>;
  getMemberId: (row: TRow) => string;
  showWorkspaceOptions?: boolean;
};

const EMAIL_TYPE_LABELS: Record<MailingListEmailType, string> = {
  personal: "Copy personal emails",
  workspace: "Copy workspace emails",
  preferred: "Copy preferred emails",
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
    parts.push(`${args.skippedNoEmailCount} without email skipped`);
  }

  if (args.dedupedCount > 0) {
    parts.push(`${args.dedupedCount} duplicate${args.dedupedCount === 1 ? "" : "s"} collapsed`);
  }

  return `${parts.join(", ")}.`;
}

export function MailingListAction<TRow>({
  scope,
  table,
  getMemberId,
  showWorkspaceOptions = false,
}: MailingListActionProps<TRow>) {
  const mailingListAction = useAction(resolveMailingListAction);

  const handleCopy = useCallback(
    async (emailType: MailingListEmailType) => {
      const selectedMemberIds = table
        .getSelectedRowModel()
        .rows.map((row) => getMemberId(row.original));

      const result = await mailingListAction.executeAsync({
        scope,
        selectedMemberIds,
        emailType,
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
        toast.error("No emails were available to copy.");
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
    },
    [getMemberId, mailingListAction, scope, table],
  );

  if (!showWorkspaceOptions) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => void handleCopy("personal")}
        disabled={mailingListAction.isPending}
      >
        <MailIcon data-icon="inline-start" />
        {mailingListAction.isPending ? "Preparing..." : "Copy emails"}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={mailingListAction.isPending}
        >
          <MailIcon data-icon="inline-start" />
          {mailingListAction.isPending ? "Preparing..." : "Copy emails"}
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(["personal", "workspace", "preferred"] as const).map((type) => (
          <DropdownMenuItem
            key={type}
            onClick={() => void handleCopy(type)}
            disabled={mailingListAction.isPending}
          >
            {EMAIL_TYPE_LABELS[type]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
