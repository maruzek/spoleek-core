"use client";

import { useMemo, useState } from "react";
import { useFormatters } from "@/components/locale-provider";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  ArrowRightIcon,
  FolderTreeIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
  ShieldIcon,
  ShieldOffIcon,
} from "lucide-react";
import { toast } from "sonner";

import { GroupCategoryForm } from "@/components/app/group-category-form";
import { GroupDialog } from "@/components/app/group-dialog";
import { usePaletteIntent } from "@/hooks/use-palette-intent";
import { MemberAssignmentSheet } from "@/components/app/member-assignment-sheet";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { getMemberStatusVariant } from "@/lib/member-status-display";
import {
  groupJoinPolicyOptions,
  type GroupCategoryFormValues,
  type GroupFormValues,
} from "@/lib/groups";
import { matchesSearch } from "@/lib/search";
import type { MembershipStatus } from "@/server/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, SortableHeader } from "@/components/ui/data-table";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  assignCategoryAdminAction,
  removeCategoryAdminAction,
  saveGroupAction,
  saveGroupCategoryAction,
} from "@/server/actions/groups";

type CategoryDetailProps = {
  /** The full row: the Settings tab edits every field of it. */
  category: GroupCategoryFormValues & { id: string; updatedAt: Date };
  groups: Array<{
    id: string;
    categoryId: string;
    name: string;
    slug: string;
    description: string | null;
    joinPolicy: "admin_only" | "free_join_leave" | "request_to_join";
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    memberCount: number;
    adminCount: number;
  }>;
  categoryAdmins: Array<{
    assignmentId: string;
    memberId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    status: string;
    role: string;
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
  canManageCategoryAdmins: boolean;
  canCreateGroups: boolean;
  /** Org admins and leaders; scoped category admins only see the tabs. */
  canEditCategory: boolean;
  workspaceConnected?: boolean;
  canManageWorkspaceIntegration?: boolean;
};

const columnHelper = createColumnHelper<CategoryDetailProps["groups"][number]>();
const adminColumnHelper = createColumnHelper<CategoryDetailProps["categoryAdmins"][number]>();

const joinPolicyLabel = Object.fromEntries(
  groupJoinPolicyOptions.map((option) => [option.value, option.label]),
) as Record<CategoryDetailProps["groups"][number]["joinPolicy"], string>;


export function GroupCategoryDetail({
  category,
  groups,
  categoryAdmins,
  assignableMembers,
  canManageCategoryAdmins,
  canCreateGroups,
  canEditCategory,
  workspaceConnected,
  canManageWorkspaceIntegration,
}: CategoryDetailProps) {
  const { formatDateTime } = useFormatters();

  const router = useRouter();
  const [groupSheetState, setGroupSheetState] = useState<{
    open: boolean;
    group: CategoryDetailProps["groups"][number] | null;
  }>({
    open: false,
    group: null,
  });
  const [adminSheetOpen, setAdminSheetOpen] = useState(false);
  usePaletteIntent("new", () => setGroupSheetState({ open: true, group: null }));

  const saveGroup = useAction(saveGroupAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success(groupSheetState.group ? "Group updated." : "Group created.");
        setGroupSheetState({ open: false, group: null });
        router.refresh();
      }
    },
  });
  const saveCategory = useAction(saveGroupCategoryAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success("Category updated.");
        router.refresh();
      }
    },
  });
  const assignCategoryAdmin = useAction(assignCategoryAdminAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success("Category admin assigned.");
        setAdminSheetOpen(false);
        router.refresh();
      }
    },
  });
  const removeCategoryAdmin = useAction(removeCategoryAdminAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success("Category admin removed.");
        router.refresh();
      }
    },
  });

  const groupColumns = useMemo(
    () => [
      columnHelper.accessor((row) => row.name, {
        id: "group",
        meta: { label: "Group" },
        header: ({ column }) => <SortableHeader column={column}>Group</SortableHeader>,
        filterFn: (row, _id, value: string) =>
          matchesSearch(
            [row.original.name, row.original.slug, row.original.description ?? ""].join(" "),
            value ?? "",
          ),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link
              href={`/admin/groups/${category.id}/${row.original.id}`}
              className="truncate font-medium text-foreground hover:underline"
            >
              {row.original.name}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              {row.original.description ?? row.original.slug}
            </span>
          </div>
        ),
      }),
      columnHelper.accessor("joinPolicy", {
        meta: { label: "Join policy" },
        header: ({ column }) => <SortableHeader column={column}>Join policy</SortableHeader>,
        sortingFn: (a, b) =>
          joinPolicyLabel[a.original.joinPolicy].localeCompare(joinPolicyLabel[b.original.joinPolicy]),
        cell: (info) => <Badge variant="outline">{joinPolicyLabel[info.getValue()]}</Badge>,
      }),
      columnHelper.accessor("memberCount", {
        meta: { label: "Members" },
        header: ({ column }) => <SortableHeader column={column}>Members</SortableHeader>,
        cell: (info) =>
          info.getValue() > 0 ? (
            <span className="tabular-nums">{info.getValue()}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      }),
      columnHelper.accessor("adminCount", {
        meta: { label: "Group admins" },
        header: ({ column }) => <SortableHeader column={column}>Group admins</SortableHeader>,
        cell: (info) =>
          info.getValue() > 0 ? (
            <span className="tabular-nums">{info.getValue()}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      }),
      columnHelper.accessor("isActive", {
        meta: { label: "Status" },
        header: "Status",
        enableSorting: false,
        cell: (info) => (
          <Status variant={info.getValue() ? "success" : "default"}>
            <StatusIndicator />
            <StatusLabel>{info.getValue() ? "Active" : "Archived"}</StatusLabel>
          </Status>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Edit ${row.original.name}`}
              onClick={() => setGroupSheetState({ open: true, group: row.original })}
            >
              <PencilIcon />
            </Button>
            <Button asChild size="icon-sm" variant="ghost" aria-label={`Open ${row.original.name}`}>
              <Link href={`/admin/groups/${category.id}/${row.original.id}`}>
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        ),
      }),
    ],
    [category.id],
  );

  const adminColumns = useMemo(
    () => [
      adminColumnHelper.accessor((row) => getMemberDisplayName(row), {
        id: "member",
        meta: { label: "Member" },
        header: ({ column }) => <SortableHeader column={column}>Member</SortableHeader>,
        filterFn: (row, _id, value: string) =>
          matchesSearch(
            [row.original.firstName, row.original.lastName, row.original.email ?? ""].join(" "),
            value ?? "",
          ),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium text-foreground">
              {getMemberDisplayName(row.original)}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {row.original.email ?? "No email"}
            </span>
          </div>
        ),
      }),
      adminColumnHelper.accessor("status", {
        meta: { label: "Status" },
        header: "Status",
        enableSorting: false,
        cell: (info) => (
          <Status variant={getMemberStatusVariant(info.getValue() as MembershipStatus)}>
            <StatusIndicator />
            <StatusLabel className="capitalize">{info.getValue()}</StatusLabel>
          </Status>
        ),
      }),
      adminColumnHelper.accessor("assignedAt", {
        meta: { label: "Assigned" },
        header: ({ column }) => <SortableHeader column={column}>Assigned</SortableHeader>,
        cell: (info) => (
          <span className="text-sm text-muted-foreground">{formatDateTime(info.getValue())}</span>
        ),
      }),
      adminColumnHelper.display({
        id: "actions",
        header: "",
        enableHiding: false,
        cell: ({ row }) =>
          canManageCategoryAdmins ? (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={removeCategoryAdmin.isPending}
                onClick={() =>
                  removeCategoryAdmin.execute({
                    categoryId: category.id,
                    memberId: row.original.memberId,
                  })
                }
              >
                <ShieldOffIcon data-icon="inline-start" />
                Remove
              </Button>
            </div>
          ) : null,
      }),
    ],
    [canManageCategoryAdmins, category.id, formatDateTime, removeCategoryAdmin],
  );

  const availableCategoryAdmins = assignableMembers.filter(
    (member) =>
      member.status === "active" &&
      !categoryAdmins.some((admin) => admin.memberId === member.id),
  );

  return (
    <div className="flex flex-col gap-6">
      <Tabs defaultValue="groups">
        <TabsList>
          <TabsTrigger value="groups">
            <FolderTreeIcon data-icon="inline-start" />
            Groups
            <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{groups.length}</span>
          </TabsTrigger>
          <TabsTrigger value="admins">
            <ShieldIcon data-icon="inline-start" />
            Category admins
            {categoryAdmins.length > 0 ? (
              <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                {categoryAdmins.length}
              </span>
            ) : null}
          </TabsTrigger>
          {canEditCategory ? (
            <TabsTrigger value="settings">
              <Settings2Icon data-icon="inline-start" />
              Settings
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="groups" className="flex flex-col gap-4 pt-4">
          <DataTable
            data={groups}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            columns={groupColumns as any}
            searchKey="group"
            searchPlaceholder="Search groups..."
            emptyStateTitle="No groups in this category yet"
            emptyStateDescription={
              canCreateGroups
                ? "Create the first active group inside this category."
                : "No groups you can manage are assigned in this category."
            }
            onRowClick={(row) => router.push(`/admin/groups/${category.id}/${row.id}`)}
            toolbarActions={() =>
              canCreateGroups ? (
                <Button onClick={() => setGroupSheetState({ open: true, group: null })}>
                  <PlusIcon data-icon="inline-start" />
                  New group
                </Button>
              ) : null
            }
          />
        </TabsContent>

        <TabsContent value="admins" className="flex flex-col gap-4 pt-4">
          <DataTable
            data={categoryAdmins}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            columns={adminColumns as any}
            searchKey="member"
            searchPlaceholder="Search category admins..."
            emptyStateTitle="No category admins"
            emptyStateDescription="Category admins can manage every group inside this category. Until one is assigned, organisation admins do."
            onRowClick={(admin) => router.push(`/admin/members/${admin.memberId}`)}
            toolbarActions={() =>
              canManageCategoryAdmins ? (
                <Button onClick={() => setAdminSheetOpen(true)}>
                  <PlusIcon data-icon="inline-start" />
                  Add category admin
                </Button>
              ) : null
            }
          />
        </TabsContent>

        {canEditCategory ? (
          <TabsContent value="settings" className="flex flex-col gap-6 pt-4">
            {/* Centred like the group settings: a long form reads as a column. */}
            <Card className="mx-auto w-full max-w-2xl overflow-hidden">
              <CardHeader>
                <CardTitle>Category settings</CardTitle>
                <CardDescription>Last saved {formatDateTime(category.updatedAt)}.</CardDescription>
              </CardHeader>
              <CardContent>
                <GroupCategoryForm
                  key={`${category.id}-${category.updatedAt.toISOString()}`}
                  category={category}
                  isPending={saveCategory.isPending}
                  validationErrors={saveCategory.result.validationErrors}
                  submitLabel="Save category"
                  onSubmit={async (value: GroupCategoryFormValues) => {
                    const result = await saveCategory.executeAsync(value);

                    if (result?.serverError) {
                      toast.error(result.serverError);
                    }
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>

      <GroupDialog
        open={groupSheetState.open}
        categoryId={category.id}
        group={groupSheetState.group}
        isPending={saveGroup.isPending}
        validationErrors={saveGroup.result.validationErrors}
        categoryManagesFees={category.managesMembershipFees}
        workspaceConnected={workspaceConnected}
        canManageWorkspaceIntegration={canManageWorkspaceIntegration}
        onOpenChange={(open) => setGroupSheetState((current) => ({ ...current, open }))}
        onSubmit={async (value: GroupFormValues) => {
          const result = await saveGroup.executeAsync(value);

          if (result?.serverError) {
            toast.error(result.serverError);
          }
        }}
      />

      <MemberAssignmentSheet
        open={adminSheetOpen}
        title="Assign category admin"
        description="Category admins can manage all groups inside this category."
        members={availableCategoryAdmins}
        isPending={assignCategoryAdmin.isPending}
        onOpenChange={setAdminSheetOpen}
        selectionMode="single"
        onSubmit={async ([memberId]) => {
          if (!memberId) {
            return;
          }

          const result = await assignCategoryAdmin.executeAsync({
            categoryId: category.id,
            memberId,
          });

          if (result?.serverError) {
            toast.error(result.serverError);
          }
        }}
      />
    </div>
  );
}
