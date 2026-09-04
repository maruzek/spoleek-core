"use client";

import type { ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { formatDate } from "@/lib/format";
import type { TenantMember } from "@/server/db/schema";
import type { MemberGroupAssignment } from "@/server/queries/members";

type HeaderMember = Omit<TenantMember, "status"> & {
  status: Exclude<TenantMember["status"], "deleted">;
};

const ROLE_LABELS: Record<HeaderMember["role"], string> = {
  member: "Member",
  leader: "Leader",
  org_admin: "Org admin",
};

function getStatusVariant(status: HeaderMember["status"]) {
  if (status === "active") return "success";
  if (status === "suspended") return "error";
  if (status === "pending") return "warning";
  if (status === "invited") return "info";
  return "default";
}

function getInitials(member: HeaderMember) {
  const initials = [member.firstName, member.lastName]
    .map((part) => part.trim().charAt(0))
    .filter(Boolean)
    .join("")
    .toUpperCase();

  return initials || member.email?.charAt(0).toUpperCase() || "?";
}

export function MemberDetailHeader({
  member,
  linkedUserName,
  promotedGroups,
  actions,
}: {
  member: HeaderMember;
  linkedUserName: string | null;
  /** Assignments in categories the org gave a members-table column. */
  promotedGroups: MemberGroupAssignment[];
  actions: ReactNode;
}) {
  const displayName =
    [member.firstName, member.lastName].filter(Boolean).join(" ").trim() ||
    member.email ||
    "Unnamed member";

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <Avatar className="size-14 shrink-0">
          <AvatarFallback className="text-base font-semibold">
            {getInitials(member)}
          </AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
              {displayName}
            </h1>
            <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>
            <Status variant={getStatusVariant(member.status)}>
              <StatusIndicator />
              <StatusLabel className="capitalize">
                {member.status}
              </StatusLabel>
            </Status>
            {promotedGroups.map((assignment) => (
              <Badge key={assignment.id} variant="outline">
                {assignment.name}
                {assignment.role === "group_admin" ? " • admin" : ""}
              </Badge>
            ))}
          </div>

          <p className="truncate text-sm text-muted-foreground">
            {member.email ?? "No email on file"}
          </p>

          <p className="text-sm text-muted-foreground">
            {member.userId
              ? `Linked account${linkedUserName ? ` · ${linkedUserName}` : ""}`
              : "Shadow profile · no login yet"}
            {" · "}
            Joined {formatDate(member.createdAt)}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}
