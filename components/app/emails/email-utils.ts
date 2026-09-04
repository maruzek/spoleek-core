import { formatDateTime } from "@/lib/format";
import type { EmailActivityStatus, EmailKind } from "@/server/db/schema";

export function getEmailStatusVariant(status: EmailActivityStatus) {
  if (status === "delivered") {
    return "success" as const;
  }

  if (
    status === "bounced" ||
    status === "complained" ||
    status === "suppressed" ||
    status === "failed"
  ) {
    return "error" as const;
  }

  return "info" as const;
}

export function getEmailKindLabel(kind: EmailKind) {
  switch (kind) {
    case "member_activation_invite":
      return "Member activation invite";
    case "registration_submitted":
      return "New application";
    case "registration_acknowledgement":
      return "Application received";
    case "registration_duplicate_notice":
      return "Address already registered";
    case "registration_rejected":
      return "Application declined";
    case "workspace_welcome":
      return "Workspace welcome";
    default:
      return String(kind).replaceAll("_", " ");
  }
}

export type EmailDateRange = "7d" | "30d" | "90d" | "all";

export function isInsideWindow(date: Date | null, range: EmailDateRange) {
  if (!date || range === "all") {
    return true;
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

export function formatMaybeDate(value: Date | null) {
  return value ? formatDateTime(value) : "Not recorded";
}
