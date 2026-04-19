"use client";

import { useMemo, useState } from "react";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { PlusIcon, ShieldIcon } from "lucide-react";
import { toast } from "sonner";

import { GroupSheet } from "@/components/app/group-sheet";
import { MemberAssignmentSheet } from "@/components/app/member-assignment-sheet";
import { formatDateTime } from "@/lib/format";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import type { GroupFormValues } from "@/lib/groups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import {
  assignCategoryAdminAction,
  removeCategoryAdminAction,
  saveGroupAction,
} from "@/server/actions/groups";

type CategoryDetailProps = {
  category: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isActive: boolean;
    isPinnedToNavigation: boolean;
    showInRegistration: boolean;
    selectionMode: "single" | "multiple";
    selectionRequired: boolean;
    maxSelections: number | null;
    defaultJoinPolicy: "admin_only" | "free_join_leave" | "request_to_join";
    managesMembershipFees: boolean;
    sortOrder: number;
    updatedAt: Date;
  };
  orgFeeDefaults?: {
    renewalMonth: number | null;
    renewalDay: number | null;
    feeAmount: number | null;
    feeCurrency: string;
    feeBankAccount: string | null;
  };
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
};

const columnHelper = createColumnHelper<CategoryDetailProps["groups"][number]>();

export function GroupCategoryDetail({
  category,
  groups,
  categoryAdmins,
  assignableMembers,
  canManageCategoryAdmins,
  canCreateGroups,
  orgFeeDefaults,
}: CategoryDetailProps) {
  const router = useRouter();
  const [groupSheetState, setGroupSheetState] = useState<{
    open: boolean;
    group: CategoryDetailProps["groups"][number] | null;
  }>({
    open: false,
    group: null,
  });
  const [adminSheetOpen, setAdminSheetOpen] = useState(false);

  const saveGroup = useAction(saveGroupAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success(groupSheetState.group ? "Group updated." : "Group created.");
        setGroupSheetState({ open: false, group: null });
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
      columnHelper.display({
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
      columnHelper.accessor(
        (row) => [row.name, row.slug, row.description ?? ""].filter(Boolean).join(" "),
        {
          id: "group",
          header: "Group",
          cell: ({ row }) => (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-foreground">{row.original.name}</span>
              <span className="text-sm text-muted-foreground">
                {row.original.description ?? row.original.slug}
              </span>
            </div>
          ),
        },
      ),
      columnHelper.accessor("joinPolicy", {
        header: "Join policy",
        cell: (info) => <Badge variant="secondary">{info.getValue().replaceAll("_", " ")}</Badge>,
      }),
      columnHelper.accessor("memberCount", {
        header: "Members",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("adminCount", {
        header: "Group admins",
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("isActive", {
        header: "Status",
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "secondary"}>
            {info.getValue() ? "Active" : "Archived"}
          </Badge>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setGroupSheetState({ open: true, group: row.original })}
            >
              Edit
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/admin/groups/${category.id}/${row.original.id}`}>Open</Link>
            </Button>
          </div>
        ),
      }),
    ],
    [category.id],
  );

  const availableCategoryAdmins = assignableMembers.filter(
    (member) =>
      member.status === "active" &&
      !categoryAdmins.some((admin) => admin.memberId === member.id),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{category.name}</CardTitle>
            <CardDescription>
              {category.description ?? "This category controls a slice of the organization structure."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant={category.isActive ? "default" : "secondary"}>
              {category.isActive ? "Active" : "Archived"}
            </Badge>
            <Badge variant="secondary">{category.selectionMode}</Badge>
            {category.selectionRequired ? <Badge variant="outline">Required</Badge> : null}
            {category.maxSelections ? (
              <Badge variant="outline">Max {category.maxSelections}</Badge>
            ) : null}
            {category.showInRegistration ? <Badge variant="outline">Registration</Badge> : null}
            {category.isPinnedToNavigation ? <Badge variant="outline">Pinned</Badge> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category admins</CardTitle>
            <CardDescription>
              These members can manage every group inside this category.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {categoryAdmins.length > 0 ? (
              categoryAdmins.map((admin) => (
                <div
                  key={admin.assignmentId}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-foreground">
                      {getMemberDisplayName(admin)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {admin.email ?? "No email"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Assigned {formatDateTime(admin.assignedAt)}
                    </span>
                  </div>
                  {canManageCategoryAdmins ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        removeCategoryAdmin.execute({
                          categoryId: category.id,
                          memberId: admin.memberId,
                        })
                      }
                      disabled={removeCategoryAdmin.isPending}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No category admins assigned yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

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
        toolbarActions={() => {
          if (!canManageCategoryAdmins && !canCreateGroups) {
            return null;
          }

          return (
            <div className="flex items-center gap-2">
              {canManageCategoryAdmins ? (
                <Button variant="outline" onClick={() => setAdminSheetOpen(true)}>
                  <ShieldIcon data-icon="inline-start" />
                  Add category admin
                </Button>
              ) : null}
              {canCreateGroups ? (
                <Button onClick={() => setGroupSheetState({ open: true, group: null })}>
                  <PlusIcon data-icon="inline-start" />
                  New group
                </Button>
              ) : null}
            </div>
          );
        }}
      />

      <GroupSheet
        open={groupSheetState.open}
        categoryId={category.id}
        group={groupSheetState.group}
        isPending={saveGroup.isPending}
        validationErrors={saveGroup.result.validationErrors}
        categoryManagesFees={category.managesMembershipFees}
        orgFeeDefaults={orgFeeDefaults}
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
