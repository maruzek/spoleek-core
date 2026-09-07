"use client";

import { useCallback, useState } from "react";
import { DownloadIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  exportMemberDataAction,
  exportMyDataAction,
} from "@/server/actions/member-data-export";

/**
 * Downloads a member's data export as JSON.
 *
 * The file is built per request and handed straight to the browser — never
 * written to disk or cached server-side, so there is no second copy of the
 * member's data sitting somewhere to look after, and the file can never be
 * stale relative to the record.
 *
 * Two modes because an access request arrives two ways: the member clicks it
 * themselves (which is what stops most requests becoming tickets), or an
 * administrator produces it for a request that came in by email.
 */
type MemberDataExportButtonProps = {
  /** Omitted in `self` mode — a member exports themselves and nobody else. */
  memberId?: string;
  mode: "self" | "admin";
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default";
  className?: string;
};

function saveJson(filename: string, json: string) {
  const url = URL.createObjectURL(
    new Blob([json], { type: "application/json;charset=utf-8" }),
  );
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoked on the next tick: Safari has not started the download yet when the
  // click handler returns, and freeing the object URL immediately cancels it.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function MemberDataExportButton({
  memberId,
  mode,
  variant = "outline",
  size = "default",
  className,
}: MemberDataExportButtonProps) {
  const [isSaving, setIsSaving] = useState(false);

  const onDone = useCallback(
    (result: { filename: string; json: string } | undefined) => {
      if (!result) {
        return;
      }

      saveJson(result.filename, result.json);
      toast.success("Data export downloaded.");
    },
    [],
  );

  const selfAction = useAction(exportMyDataAction, {
    onSuccess: ({ data }) => onDone(data),
    onError: ({ error }) =>
      toast.error(error.serverError ?? "Could not build the export."),
    onSettled: () => setIsSaving(false),
  });

  const adminAction = useAction(exportMemberDataAction, {
    onSuccess: ({ data }) => onDone(data),
    onError: ({ error }) =>
      toast.error(error.serverError ?? "Could not build the export."),
    onSettled: () => setIsSaving(false),
  });

  const isPending =
    isSaving || selfAction.isPending || adminAction.isPending;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={isPending}
      onClick={() => {
        setIsSaving(true);

        if (mode === "self") {
          selfAction.execute({});
          return;
        }

        if (!memberId) {
          setIsSaving(false);
          return;
        }

        adminAction.execute({ memberId });
      }}
    >
      <DownloadIcon data-icon="inline-start" />
      {isPending ? "Preparing..." : "Download data"}
    </Button>
  );
}
