"use client";

import type { ReactNode } from "react";
import { CalendarIcon, LinkIcon, MailIcon } from "lucide-react";

import { DetailHeader, DetailMeta, DetailMetaItem } from "@/components/app/detail-header";
import { useFormatters } from "@/components/locale-provider";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
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
  const { formatDate } = useFormatters();

  const displayName =
    [member.firstName, member.lastName].filter(Boolean).join(" ").trim() ||
    member.email ||
    "Unnamed member";

  return (
    <DetailHeader
      leading={
        <Avatar className="size-14 shrink-0">
          <AvatarFallback className="text-base font-semibold">{getInitials(member)}</AvatarFallback>
        </Avatar>
      }
      badges={
        <>
          <Badge variant="secondary">{ROLE_LABELS[member.role]}</Badge>
          <Status variant={getStatusVariant(member.status)}>
            <StatusIndicator />
            <StatusLabel className="capitalize">{member.status}</StatusLabel>
          </Status>
          {promotedGroups.map((assignment) => (
            <Badge key={assignment.id} variant="outline">
              {assignment.name}
              {assignment.role === "group_admin" ? " • admin" : ""}
            </Badge>
          ))}
        </>
      }
      title={displayName}
      titleClassName="truncate"
      meta={
        <DetailMeta>
          <DetailMetaItem icon={<MailIcon aria-hidden />}>{member.email ?? "No email on file"}</DetailMetaItem>
          <DetailMetaItem icon={<LinkIcon aria-hidden />}>
            {member.userId
              ? `Linked account${linkedUserName ? ` · ${linkedUserName}` : ""}`
              : "Shadow profile · no login yet"}
          </DetailMetaItem>
          <DetailMetaItem icon={<CalendarIcon aria-hidden />}>Joined {formatDate(member.createdAt)}</DetailMetaItem>
        </DetailMeta>
      }
      actions={actions}
    />
  );
}
