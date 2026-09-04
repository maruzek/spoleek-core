"use client";

import Link from "next/link";
import { UsersIcon } from "lucide-react";

import {
  DefinitionList,
  DefinitionRow,
  DetailSection,
} from "@/components/app/definition-list";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/format";
import type { MemberWorkspaceGroupLink } from "@/server/queries/member-detail";
import type { MemberGroupAssignment } from "@/server/queries/members";

function groupByCategory(assignments: MemberGroupAssignment[]) {
  const byCategory = new Map<
    string,
    { name: string; assignments: MemberGroupAssignment[] }
  >();

  for (const assignment of assignments) {
    const bucket = byCategory.get(assignment.categoryId) ?? {
      name: assignment.categoryName,
      assignments: [],
    };
    bucket.assignments.push(assignment);
    byCategory.set(assignment.categoryId, bucket);
  }

  return [...byCategory.entries()];
}

export function MemberGroupsTab({
  assignments,
  workspaceGroupLinks,
}: {
  assignments: MemberGroupAssignment[];
  workspaceGroupLinks: MemberWorkspaceGroupLink[];
}) {
  if (assignments.length === 0 && workspaceGroupLinks.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>No group assignments</EmptyTitle>
          <EmptyDescription>
            Assign this member to a group from the Overview tab&apos;s edit
            mode.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const categories = groupByCategory(assignments);

  return (
    <div className="flex flex-col gap-8">
      {categories.map(([categoryId, category]) => (
        <DetailSection key={categoryId} title={category.name}>
          <div className="flex flex-col gap-1">
            {category.assignments.map((assignment) => (
              <Item key={assignment.id} variant="outline" asChild>
                <Link href={`/admin/groups/${assignment.categoryId}/${assignment.id}`}>
                  <ItemContent>
                    <ItemTitle className="flex items-center gap-2">
                      {assignment.name}
                      {assignment.role === "group_admin" ? (
                        <Badge variant="secondary">Group admin</Badge>
                      ) : null}
                    </ItemTitle>
                    <ItemDescription>
                      Assigned {formatDateTime(assignment.assignedAt)}
                    </ItemDescription>
                  </ItemContent>
                </Link>
              </Item>
            ))}
          </div>
        </DetailSection>
      ))}

      {workspaceGroupLinks.length > 0 ? (
        <>
          <Separator />
          <DetailSection
            title="Google Workspace groups"
            description="Google group memberships Spoleek created for this member."
          >
            <DefinitionList>
              {workspaceGroupLinks.map((link) => (
                <DefinitionRow
                  key={link.id}
                  label={link.groupName ?? "Unlinked group"}
                  value={link.address}
                  description={
                    link.lastSyncedAt
                      ? `Last synced ${formatDateTime(link.lastSyncedAt)} · ${link.lastSyncStatus}`
                      : `Never synced · ${link.lastSyncStatus}`
                  }
                />
              ))}
            </DefinitionList>
          </DetailSection>
        </>
      ) : null}
    </div>
  );
}
