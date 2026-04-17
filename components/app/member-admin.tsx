"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  createColumnHelper,
  type Table as TanStackTable,
} from "@tanstack/react-table";
import {
  AlertTriangleIcon,
  MailIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { BadgeOverflow } from "@/components/ui/badge-overflow";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { formatDateTime } from "@/lib/format";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { copyToClipboard } from "@/utils/copy";
import {
  approveMemberAction,
  bulkDeleteMembersAction,
  createShadowMemberAction,
  deleteMemberAction,
  resendMemberInviteAction,
  updateMemberAction,
} from "@/server/actions/member-admin";
import type {
  MemberCustomField,
  TenantMember,
} from "@/server/db/schema";
import type {
  MemberEditorMetadata,
  MemberGroupAssignment,
  MemberInviteState,
  MembersTableCategory,
} from "@/server/queries/members";
import { MemberEditSheet } from "./member-edit-sheet";
import { MailingListAction } from "./mailing-list-action";
import { MemberSheet } from "./member-sheet";

type VisibleMemberStatus = Exclude<TenantMember["status"], "deleted">;

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: "member" | "leader" | "org_admin";
  status: VisibleMemberStatus;
  userId: string | null;
  createdAt: Date;
  primaryGroup: MemberGroupAssignment | null;
  customFieldValues: Record<string, string>;
  groupAssignmentsByCategory: Record<string, MemberGroupAssignment[]>;
  inviteState: MemberInviteState;
};

type MemberEditorData = {
  member: Omit<TenantMember, "status"> & { status: VisibleMemberStatus };
  customFieldAnswers: Record<string, unknown>;
  metadata: MemberEditorMetadata;
};

const columnHelper = createColumnHelper<MemberRow>();

function getStatusVariant(status: VisibleMemberStatus) {
  if (status === "active") {
    return "success";
  }

  if (status === "pending") {
    return "warning";
  }

  if (status === "invited") {
    return "info";
  }

  return "default";
}

function getInviteIssue(member: MemberRow) {
  if (member.inviteState.status === "failed") {
    return {
      label: "Invite failed",
      variant: "destructive" as const,
    };
  }

  if (member.inviteState.deliveryStatus === "bounced") {
    return {
      label: "Email bounced",
      variant: "destructive" as const,
    };
  }

  if (member.inviteState.deliveryStatus === "complained") {
    return {
      label: "Complaint",
      variant: "destructive" as const,
    };
  }

  if (member.inviteState.deliveryStatus === "suppressed") {
    return {
      label: "Suppressed",
      variant: "destructive" as const,
    };
  }

  return null;
}

function CategoryCell({
  assignments,
}: {
  assignments: MemberGroupAssignment[];
}) {
  if (assignments.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <BadgeOverflow
      items={assignments}
      getBadgeLabel={(item) => item.name}
      className="max-w-[16rem] min-w-0"
      renderBadge={(item) => (
        <Badge
          key={`${item.categoryId}-${item.id}`}
          variant={item.role === "group_admin" ? "default" : "outline"}
          className="max-w-full truncate"
        >
          <span className="truncate">
            {item.name}
            {item.role === "group_admin" ? " • admin" : ""}
          </span>
        </Badge>
      )}
      renderOverflow={(count) => <Badge variant="outline">+{count}</Badge>}
    />
  );
}

export function MemberAdmin({
  members,
  customFields,
  memberCategories,
  selectedMember,
}: {
  members: MemberRow[];
  customFields: MemberCustomField[];
  memberCategories: MembersTableCategory[];
  selectedMember: MemberEditorData | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const copyEmail = useCallback(async (email: string) => {
    const copied = await copyToClipboard(email);

    if (copied) {
      toast.success("Personal email copied.");
      return;
    }

    toast.error("Could not copy personal email.");
  }, []);

  const updateSearchParam = useCallback((memberId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());

    if (memberId) {
      params.set("edit", memberId);
    } else {
      params.delete("edit");
    }

    const nextUrl =
      params.toString().length > 0 ? `${pathname}?${params}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  const createAction = useAction(createShadowMemberAction, {
    onSuccess() {
      setSheetOpen(false);
      router.refresh();
    },
  });
  const approveAction = useAction(approveMemberAction, {
    onSuccess({ data }) {
      if (data?.inviteReason === "cooldown") {
        toast.error("The invite was not resent because the resend cooldown is still active.");
      } else if (data?.inviteReason === "already-completed") {
        toast.success("Member approved. This account was already activated.");
      } else if (data?.inviteReason === "suppressed") {
        toast.error("Member approved, but the invite email is blocked due to a bounce, complaint, or suppression.");
      } else if (data?.inviteSent) {
        toast.success("Member approved and activation email sent.");
      } else {
        toast.success("Member approved.");
      }

      router.refresh();
    },
  });
  const updateAction = useAction(updateMemberAction, {
    onSuccess() {
      updateSearchParam(null);
      router.refresh();
    },
  });
  const resendInviteAction = useAction(resendMemberInviteAction, {
    onSuccess({ data }) {
      if (!data) {
        return;
      }

      if (data.sent) {
        toast.success("Activation email sent.");
        router.refresh();
        return;
      }

      const message =
        data.reason === "cooldown"
          ? "Invite resend is cooling down. Wait a few minutes before trying again."
          : data.reason === "already-completed"
            ? "This member already completed account activation."
            : data.reason === "already-active"
              ? "This member is already linked and does not need another invite."
              : data.reason === "suppressed"
                ? "Email delivery is blocked for this address due to a bounce, complaint, or suppression."
                : "The current activation email is still valid, so a new one was not sent.";

      toast.error(message);
      router.refresh();
    },
  });
  const deleteAction = useAction(deleteMemberAction, {
    onSuccess({ data }) {
      if (!data) {
        return;
      }

      if (data.deletedCount > 0) {
        setBulkDeleteOpen(false);
        updateSearchParam(null);
        toast.success("Member deleted.");
        router.refresh();
        return;
      }

      if (data.skippedProtectedCount > 0) {
        toast.error("Org admins cannot be deleted.");
        return;
      }

      toast.error("Member was already deleted or unavailable.");
    },
  });
  const bulkDeleteAction = useAction(bulkDeleteMembersAction, {
    onSuccess({ data }) {
      if (!data) {
        return;
      }

      const parts = [];

      if (data.deletedCount > 0) {
        parts.push(
          `${data.deletedCount} member${data.deletedCount === 1 ? "" : "s"} deleted`,
        );
      }

      if (data.skippedProtectedCount > 0) {
        parts.push(
          `${data.skippedProtectedCount} protected member${data.skippedProtectedCount === 1 ? "" : "s"} skipped`,
        );
      }

      if (data.skippedMissingCount > 0) {
        parts.push(
          `${data.skippedMissingCount} unavailable member${data.skippedMissingCount === 1 ? "" : "s"} skipped`,
        );
      }

      if (parts.length > 0) {
        if (data.deletedCount > 0) {
          toast.success(parts.join(", "));
        } else {
          toast.error(parts.join(", "));
        }
      }

      setBulkDeleteOpen(false);
      router.refresh();
    },
  });

  const columns = useMemo(
    () => {
      const baseColumns = [
        columnHelper.display({
          id: "select",
          meta: { label: "Select" },
          header: ({ table }) => (
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected() ||
                (table.getIsSomePageRowsSelected() && "indeterminate")
              }
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="Select all"
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
            />
          ),
          enableSorting: false,
          enableHiding: false,
        }),
        columnHelper.accessor(
          (member) =>
            [member.firstName, member.lastName, member.email ?? ""]
              .filter(Boolean)
              .join(" "),
          {
            id: "member",
            meta: { label: "Member" },
            header: "Member",
            cell: ({ row }) => {
              const member = row.original;

              return (
                <button
                  type="button"
                  onClick={() => updateSearchParam(member.id)}
                  className="flex min-w-0 max-w-[18rem] flex-col gap-1 rounded-md text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <span className="truncate font-medium text-foreground underline-offset-4 hover:underline">
                    {getMemberDisplayName(member)}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {member.email || "No email yet"}
                  </span>
                </button>
              );
            },
          },
        ),
        columnHelper.accessor("status", {
          meta: { label: "Status" },
          header: "Status",
          cell: ({ row }) => {
            const member = row.original;
            const inviteIssue = getInviteIssue(member);

            return (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Status variant={getStatusVariant(member.status)}>
                  <StatusIndicator />
                  <StatusLabel className="capitalize">
                    {member.status.replace("_", " ")}
                  </StatusLabel>
                </Status>
                {inviteIssue ? (
                  <Badge variant={inviteIssue.variant} className="w-fit">
                    {inviteIssue.label}
                  </Badge>
                ) : null}
              </div>
            );
          },
        }),
        columnHelper.accessor("role", {
          meta: { label: "Role" },
          header: "Role",
          cell: (info) => (
            <span className="text-sm capitalize text-muted-foreground">
              {info.getValue().replace("_", " ")}
            </span>
          ),
        }),
        columnHelper.display({
          id: "personal-email",
          meta: { label: "Personal Email" },
          header: "Personal Email",
          cell: ({ row }) => {
            const email = row.original.email;

            if (!email) {
              return <span className="text-sm text-muted-foreground">—</span>;
            }

            return (
              <button
                type="button"
                onClick={() => void copyEmail(email)}
                className="block max-w-[16rem] truncate rounded-md text-left text-sm text-foreground underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                aria-label={`Copy personal email ${email}`}
                title="Copy personal email"
              >
                {email}
              </button>
            );
          },
        }),
      ];

      const categoryColumns = memberCategories.map((category) =>
        columnHelper.display({
          id: `category-${category.id}`,
          meta: { label: category.name },
          header: () => (
            <div className="min-w-[9rem] text-sm font-medium text-foreground">
              {category.name}
            </div>
          ),
          cell: ({ row }) => (
            <CategoryCell
              assignments={row.original.groupAssignmentsByCategory[category.id] ?? []}
            />
          ),
        }),
      );

      const customFieldColumns = customFields.map((field) =>
        columnHelper.display({
          id: `field-${field.key}`,
          meta: { label: field.label },
          header: () => (
            <div className="min-w-[10rem] text-sm font-medium text-foreground">
              {field.label}
            </div>
          ),
          cell: ({ row }) => {
            const value = row.original.customFieldValues[field.key];

            return value ? (
              <span className="block max-w-[14rem] truncate text-sm text-foreground">
                {value}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            );
          },
        }),
      );

      const trailingColumns = [
        columnHelper.accessor("createdAt", {
          meta: { label: "Joined" },
          header: "Joined",
          cell: (info) => (
            <span className="text-sm text-muted-foreground">
              {formatDateTime(info.getValue())}
            </span>
          ),
        }),
        columnHelper.display({
          id: "actions",
          meta: { label: "Actions" },
          header: "",
          cell: ({ row }) => {
            const member = row.original;

            return (
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => updateSearchParam(member.id)}
                >
                  <PencilIcon data-icon="inline-start" />
                  Edit
                </Button>
                {member.status === "pending" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={() =>
                      approveAction.execute({
                        memberId: member.id,
                        role: member.role,
                      })
                    }
                    disabled={approveAction.isPending}
                  >
                    Approve
                  </Button>
                ) : null}
                {member.status === "invited" &&
                member.email &&
                member.inviteState.status !== "completed" &&
                !member.userId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      resendInviteAction.execute({
                        memberId: member.id,
                      })
                    }
                    disabled={
                      resendInviteAction.isPending ||
                      member.inviteState.deliveryStatus === "suppressed" ||
                      member.inviteState.deliveryStatus === "complained" ||
                      member.inviteState.deliveryStatus === "bounced"
                    }
                  >
                    <MailIcon data-icon="inline-start" />
                    {member.inviteState.status === "sent" ||
                    member.inviteState.status === "failed"
                      ? "Resend invite"
                      : "Send invite"}
                  </Button>
                ) : null}
              </div>
            );
          },
        }),
      ];

      return [
        ...baseColumns,
        ...categoryColumns,
        ...customFieldColumns,
        ...trailingColumns,
      ];
    },
    [
      approveAction,
      copyEmail,
      customFields,
      memberCategories,
      resendInviteAction,
      updateSearchParam,
    ],
  );

  const renderToolbarActions = (table: TanStackTable<MemberRow>) => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const selectedCount = selectedRows.length;

    return (
      <div className="flex items-center gap-2">
        <MailingListAction
          scope={{ kind: "members-admin" }}
          table={table}
          getMemberId={(member) => member.id}
        />
        <Button onClick={() => setSheetOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          New Member
        </Button>
        {selectedCount > 0 ? (
          <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2Icon data-icon="inline-start" />
              Delete selected
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <AlertTriangleIcon />
                </AlertDialogMedia>
                <AlertDialogTitle>
                  Delete {selectedCount} selected member
                  {selectedCount === 1 ? "" : "s"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Selected org admins will be skipped. All other selected
                  members will be hidden immediately and permanently purged
                  after 30 days.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={bulkDeleteAction.isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={bulkDeleteAction.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    void bulkDeleteAction
                      .executeAsync({
                        memberIds: selectedRows.map((selectedRow) => selectedRow.original.id),
                      })
                      .then(() => {
                        table.resetRowSelection();
                      });
                  }}
                >
                  {bulkDeleteAction.isPending
                    ? "Deleting..."
                    : "Delete selected"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <DataTable
        data={members}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns={columns as any}
        searchKey="member"
        searchPlaceholder="Search members..."
        emptyStateTitle="No members found"
        emptyStateDescription="Create members or invite them via the portal."
        toolbarActions={renderToolbarActions}
      />

      <MemberSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        isPending={createAction.isPending}
        serverError={createAction.result.serverError}
        validationErrors={createAction.result.validationErrors}
        onSubmit={async (value) => {
          await createAction.executeAsync(value);
        }}
      />

      {selectedMember ? (
        <MemberEditSheet
          key={selectedMember.member.id}
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              updateSearchParam(null);
            }
          }}
          member={selectedMember.member}
          metadata={selectedMember.metadata}
          canDelete={selectedMember.member.role !== "org_admin"}
          customFields={customFields}
          customFieldAnswers={selectedMember.customFieldAnswers}
          isDeletePending={deleteAction.isPending}
          isPending={updateAction.isPending}
          serverError={updateAction.result.serverError}
          validationErrors={updateAction.result.validationErrors}
          customFieldErrors={updateAction.result.data?.customFieldErrors}
          onDelete={async () => {
            await deleteAction.executeAsync({
              memberId: selectedMember.member.id,
            });
          }}
          onSubmit={async (value) => {
            await updateAction.executeAsync(value);
          }}
        />
      ) : null}
    </div>
  );
}
