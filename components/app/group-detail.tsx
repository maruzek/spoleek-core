"use client";

import { useMemo, useState } from "react";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { PlusIcon, Settings2Icon, ShieldIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { GroupSheet } from "@/components/app/group-sheet";
import { MailingListAction } from "@/components/app/mailing-list-action";
import { MemberAssignmentSheet } from "@/components/app/member-assignment-sheet";
import { formatDateTime } from "@/lib/format";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import type { GroupFormValues } from "@/lib/groups";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  assignGroupAdminAction,
  assignGroupMembersAction,
  removeGroupAdminAction,
  removeGroupMemberAction,
  saveGroupAction,
} from "@/server/actions/groups";

type GroupDetailProps = {
  group: {
    id: string;
    orgId: string;
    categoryId: string;
    name: string;
    slug: string;
    description: string | null;
    joinPolicy: "admin_only" | "free_join_leave" | "request_to_join";
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    categoryName: string;
    categorySlug: string;
  };
  members: Array<{
    membershipId: string;
    memberId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    status: string;
    tenantRole: string;
    groupRole: "member" | "group_admin";
    userId: string | null;
    linkedUserName: string | null;
    assignedAt: Date;
  }>;
  admins: Array<{
    membershipId: string;
    memberId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    status: string;
    tenantRole: string;
    groupRole: "member" | "group_admin";
    userId: string | null;
    linkedUserName: string | null;
    assignedAt: Date;
  }>;
  assignableMembers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    role: string;
    status: string;
    userId: string | null;
    linkedUserName: string | null;
    createdAt: Date;
  }>;
};

const memberColumnHelper = createColumnHelper<GroupDetailProps["members"][number]>();

type RemovalState =
  | {
      kind: "member";
      memberId: string;
      label: string;
    }
  | {
      kind: "admin";
      memberId: string;
      label: string;
    }
  | null;

export function GroupDetail({ group, members, admins, assignableMembers }: GroupDetailProps) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  const [adminSheetOpen, setAdminSheetOpen] = useState(false);
  const [removalState, setRemovalState] = useState<RemovalState>(null);

  const saveGroup = useAction(saveGroupAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success("Group updated.");
        setSettingsOpen(false);
        router.refresh();
      }
    },
  });
  const assignGroupMembers = useAction(assignGroupMembersAction, {
    onSuccess({ data }) {
      if (data?.success) {
        const count = data.requestedCount;
        toast.success(
          `${count} member${count === 1 ? "" : "s"} assigned.`,
        );
        setMemberSheetOpen(false);
        router.refresh();
      }
    },
  });
  const removeGroupMember = useAction(removeGroupMemberAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success("Member removed.");
        setRemovalState(null);
        router.refresh();
      }
    },
  });
  const assignGroupAdmin = useAction(assignGroupAdminAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success("Group admin assigned.");
        setAdminSheetOpen(false);
        router.refresh();
      }
    },
  });
  const removeGroupAdmin = useAction(removeGroupAdminAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success("Group admin removed.");
        setRemovalState(null);
        router.refresh();
      }
    },
  });

  const memberColumns = useMemo(
    () => [
      memberColumnHelper.display({
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value: boolean | "indeterminate") =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value: boolean | "indeterminate") => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      }),
      memberColumnHelper.accessor(
        (row) => [row.firstName, row.lastName, row.email ?? ""].filter(Boolean).join(" "),
        {
          id: "member",
          header: "Member",
          cell: ({ row }) => (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-foreground">
                {getMemberDisplayName(row.original)}
              </span>
              <span className="text-sm text-muted-foreground">
                {row.original.email ?? "No email"}
              </span>
            </div>
          ),
        },
      ),
      memberColumnHelper.accessor("status", {
        header: "Status",
        cell: (info) => <Badge variant="secondary">{info.getValue()}</Badge>,
      }),
      memberColumnHelper.accessor("groupRole", {
        header: "Role",
        cell: (info) => (
          <Badge variant={info.getValue() === "group_admin" ? "default" : "secondary"}>
            {info.getValue().replaceAll("_", " ")}
          </Badge>
        ),
      }),
      memberColumnHelper.accessor("assignedAt", {
        header: "Assigned",
        cell: (info) => (
          <span className="text-muted-foreground">{formatDateTime(info.getValue())}</span>
        ),
      }),
      memberColumnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setRemovalState({
                  kind: "member",
                  memberId: row.original.memberId,
                  label: getMemberDisplayName(row.original),
                })
              }
            >
              Remove
            </Button>
          </div>
        ),
      }),
    ],
    [],
  );

  const adminColumns = useMemo(
    () => [
      ...memberColumns.slice(0, 4),
      memberColumnHelper.accessor("assignedAt", {
        header: "Promoted",
        cell: (info) => (
          <span className="text-muted-foreground">{formatDateTime(info.getValue())}</span>
        ),
      }),
      memberColumnHelper.display({
        id: "adminActions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setRemovalState({
                  kind: "admin",
                  memberId: row.original.memberId,
                  label: getMemberDisplayName(row.original),
                })
              }
            >
              Demote
            </Button>
          </div>
        ),
      }),
    ],
    [memberColumns],
  );

  const availableMembers = assignableMembers.filter(
    (member) =>
      member.status === "active" &&
      !members.some((assigned) => assigned.memberId === member.id),
  );
  const availableAdmins = assignableMembers.filter(
    (member) =>
      member.status === "active" &&
      !admins.some((assigned) => assigned.memberId === member.id),
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{group.name}</CardTitle>
          <CardDescription>
            {group.description ?? `Group inside ${group.categoryName}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant={group.isActive ? "default" : "secondary"}>
            {group.isActive ? "Active" : "Archived"}
          </Badge>
          <Badge variant="secondary">{group.joinPolicy.replaceAll("_", " ")}</Badge>
          <Badge variant="outline">{group.categoryName}</Badge>
        </CardContent>
      </Card>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">
            <UsersIcon data-icon="inline-start" />
            Members
          </TabsTrigger>
          <TabsTrigger value="admins">
            <ShieldIcon data-icon="inline-start" />
            Group Admins
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2Icon data-icon="inline-start" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="flex flex-col gap-4 pt-4">
          <DataTable
            data={members}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            columns={memberColumns as any}
            searchKey="member"
            searchPlaceholder="Search members..."
            emptyStateTitle="No members assigned"
            emptyStateDescription="Add the first member to this group."
            toolbarActions={(table) => (
              <div className="flex items-center gap-2">
                <MailingListAction
                  scope={{ kind: "group-members", contextId: group.id }}
                  table={table}
                  getMemberId={(member) => member.memberId}
                />
                <Button onClick={() => setMemberSheetOpen(true)}>
                  <PlusIcon data-icon="inline-start" />
                  Add member
                </Button>
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="admins" className="flex flex-col gap-4 pt-4">
          <DataTable
            data={admins}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            columns={adminColumns as any}
            searchKey="member"
            searchPlaceholder="Search group admins..."
            emptyStateTitle="No group admins assigned"
            emptyStateDescription="Promote trusted members to group admins here."
            toolbarActions={(table) => (
              <div className="flex items-center gap-2">
                <MailingListAction
                  scope={{ kind: "group-admins", contextId: group.id }}
                  table={table}
                  getMemberId={(member) => member.memberId}
                />
                <Button onClick={() => setAdminSheetOpen(true)}>
                  <PlusIcon data-icon="inline-start" />
                  Add group admin
                </Button>
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="settings" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Group settings</CardTitle>
              <CardDescription>
                Edit metadata, join policy, and archive state for this group.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button onClick={() => setSettingsOpen(true)}>Edit settings</Button>
              <span className="text-sm text-muted-foreground">
                Last updated {formatDateTime(group.updatedAt)}
              </span>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <GroupSheet
        open={settingsOpen}
        categoryId={group.categoryId}
        group={group}
        isPending={saveGroup.isPending}
        validationErrors={saveGroup.result.validationErrors}
        onOpenChange={setSettingsOpen}
        onSubmit={async (value: GroupFormValues) => {
          const result = await saveGroup.executeAsync(value);

          if (result?.serverError) {
            toast.error(result.serverError);
          }
        }}
      />

      <MemberAssignmentSheet
        open={memberSheetOpen}
        title="Assign member"
        description="Add a member to this group."
        members={availableMembers}
        isPending={assignGroupMembers.isPending}
        onOpenChange={setMemberSheetOpen}
        selectionMode="multiple"
        onSubmit={async (memberIds) => {
          const result = await assignGroupMembers.executeAsync({
            groupId: group.id,
            memberIds,
          });

          if (result?.serverError) {
            toast.error(result.serverError);
          }
        }}
      />

      <MemberAssignmentSheet
        open={adminSheetOpen}
        title="Assign group admin"
        description="Promoting someone to group admin also ensures they belong to the group."
        members={availableAdmins}
        isPending={assignGroupAdmin.isPending}
        onOpenChange={setAdminSheetOpen}
        selectionMode="single"
        onSubmit={async ([memberId]) => {
          if (!memberId) {
            return;
          }

          const result = await assignGroupAdmin.executeAsync({
            groupId: group.id,
            memberId,
          });

          if (result?.serverError) {
            toast.error(result.serverError);
          }
        }}
      />

      <AlertDialog open={removalState != null} onOpenChange={(open) => !open && setRemovalState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removalState?.kind === "admin" ? "Demote group admin?" : "Remove group member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removalState
                ? `${removalState.label} will ${
                    removalState.kind === "admin"
                      ? "keep their membership but lose admin access."
                      : "lose their group assignment."
                  }`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!removalState) {
                  return;
                }

                if (removalState.kind === "admin") {
                  removeGroupAdmin.execute({
                    groupId: group.id,
                    memberId: removalState.memberId,
                  });
                  return;
                }

                removeGroupMember.execute({
                  groupId: group.id,
                  memberId: removalState.memberId,
                });
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
