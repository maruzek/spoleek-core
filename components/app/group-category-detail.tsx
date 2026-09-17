"use client";

import { useMemo, useState } from "react";
import { useFormatters } from "@/components/locale-provider";

import { createColumnHelper } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  ArrowRightIcon,
  ClipboardListIcon,
  CoinsIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  ShieldIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { GroupDialog } from "@/components/app/group-dialog";
import { usePaletteIntent } from "@/hooks/use-palette-intent";
import { MemberAssignmentSheet } from "@/components/app/member-assignment-sheet";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { describeCategoryMembership, describeJoinPolicy } from "@/lib/group-category-display";
import { groupJoinPolicyOptions, type GroupFormValues } from "@/lib/groups";
import { matchesSearch } from "@/lib/search";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable, SortableHeader } from "@/components/ui/data-table";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  workspaceConnected?: boolean;
  canManageWorkspaceIntegration?: boolean;
};

const columnHelper = createColumnHelper<CategoryDetailProps["groups"][number]>();

const joinPolicyLabel = Object.fromEntries(
  groupJoinPolicyOptions.map((option) => [option.value, option.label]),
) as Record<CategoryDetailProps["groups"][number]["joinPolicy"], string>;

function initials(member: { firstName: string; lastName: string }) {
  return `${member.firstName.charAt(0)}${member.lastName.charAt(0)}`.toUpperCase() || "?";
}

export function GroupCategoryDetail({
  category,
  groups,
  categoryAdmins,
  assignableMembers,
  canManageCategoryAdmins,
  canCreateGroups,
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

  const availableCategoryAdmins = assignableMembers.filter(
    (member) =>
      member.status === "active" &&
      !categoryAdmins.some((admin) => admin.memberId === member.id),
  );

  const surfaces = [
    category.showInRegistration && {
      key: "registration",
      icon: ClipboardListIcon,
      label: "Registration",
      hint: "Asked at sign-up",
    },
    category.isPinnedToNavigation && {
      key: "pinned",
      icon: PinIcon,
      label: "Pinned",
      hint: "Listed under Groups in the sidebar",
    },
    category.managesMembershipFees && {
      key: "fees",
      icon: CoinsIcon,
      label: "Fees",
      hint: "Membership fees are collected per group in this category",
    },
  ].filter((surface): surface is Exclude<typeof surface, false> => Boolean(surface));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>About this category</CardTitle>
            <CardDescription>
              {category.description ?? `Members are sorted into ${category.name} through its groups.`}
            </CardDescription>
            <CardAction>
              <Status variant={category.isActive ? "success" : "default"}>
                <StatusIndicator />
                <StatusLabel>{category.isActive ? "Active" : "Archived"}</StatusLabel>
              </Status>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm">
              {describeCategoryMembership(category)}{" "}
              <span className="text-muted-foreground">
                {describeJoinPolicy(category.defaultJoinPolicy)}
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {surfaces.map(({ key, icon: Icon, label, hint }) => (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="cursor-default text-muted-foreground">
                      <Icon data-icon="inline-start" aria-hidden />
                      {label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>{hint}</TooltipContent>
                </Tooltip>
              ))}
              <span className="ml-auto self-center font-mono text-xs text-muted-foreground">
                {category.slug}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category admins</CardTitle>
            <CardDescription>Can manage every group inside this category.</CardDescription>
            {canManageCategoryAdmins ? (
              <CardAction>
                <Button size="sm" variant="outline" onClick={() => setAdminSheetOpen(true)}>
                  <ShieldIcon data-icon="inline-start" />
                  Add
                </Button>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {categoryAdmins.length > 0 ? (
              categoryAdmins.map((admin) => (
                <div
                  key={admin.assignmentId}
                  className="group/admin -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5"
                >
                  <Avatar size="sm">
                    <AvatarFallback>{initials(admin)}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {getMemberDisplayName(admin)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {admin.email ?? "No email"} · since {formatDateTime(admin.assignedAt)}
                    </span>
                  </div>
                  {canManageCategoryAdmins ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${getMemberDisplayName(admin)}`}
                      className="text-muted-foreground"
                      onClick={() =>
                        removeCategoryAdmin.execute({
                          categoryId: category.id,
                          memberId: admin.memberId,
                        })
                      }
                      disabled={removeCategoryAdmin.isPending}
                    >
                      <XIcon />
                    </Button>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No category admins yet — every group here is managed by organisation admins.
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
