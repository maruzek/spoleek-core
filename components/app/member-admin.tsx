"use client";

import { useState } from "react";
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
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { formatDateTime } from "@/lib/format";
import { MemberEditSheet } from "./member-edit-sheet";
import { MemberSheet } from "./member-sheet";
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
  MemberInviteDeliveryStatus,
  MemberInviteStatus,
  TenantMember,
} from "@/server/db/schema";

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
  linkedUserName: string | null;
  inviteStatus: MemberInviteStatus | null;
  inviteDeliveryStatus: MemberInviteDeliveryStatus | null;
  inviteSentAt: Date | null;
  inviteCompletedAt: Date | null;
  inviteExpiresAt: Date | null;
  inviteResendAvailableAt: Date | null;
  inviteActivationBlockedUntil: Date | null;
  inviteLastError: string | null;
};

const columnHelper = createColumnHelper<MemberRow>();

type MemberEditorData = {
  member: Omit<TenantMember, "status"> & { status: VisibleMemberStatus };
  customFieldAnswers: Record<string, unknown>;
};

export function MemberAdmin({
  members,
  customFields,
  selectedMember,
}: {
  members: MemberRow[];
  customFields: MemberCustomField[];
  selectedMember: MemberEditorData | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const updateSearchParam = (memberId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());

    if (memberId) {
      params.set("edit", memberId);
    } else {
      params.delete("edit");
    }

    const nextUrl =
      params.toString().length > 0 ? `${pathname}?${params}` : pathname;
    router.replace(nextUrl, { scroll: false });
  };

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

  const columns = [
    columnHelper.display({
      id: "select",
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
        header: "Member",
        id: "member",
        cell: ({ row }) => {
          const member = row.original;
          return (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-foreground">
                {getMemberDisplayName(member)}
              </span>
              <span className="text-sm text-muted-foreground line-clamp-1">
                {member.email || "No email yet"}
              </span>
            </div>
          );
        },
      },
    ),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const status = info.getValue();
        const variant =
          status === "active"
            ? "success"
            : status === "pending"
              ? "warning"
              : status === "invited"
                ? "info"
                : "default";

        return (
          <Status variant={variant}>
            <StatusIndicator />
            <StatusLabel className="capitalize">
              {status.replace("_", " ")}
            </StatusLabel>
          </Status>
        );
      },
    }),
    columnHelper.accessor("role", {
      header: "Role",
      cell: (info) => (
        <span className="capitalize text-muted-foreground">
          {info.getValue().replace("_", " ")}
        </span>
      ),
    }),
    columnHelper.accessor("userId", {
      header: "Link",
      cell: ({ row }) => {
        const member = row.original;
        return (
          <span className="text-muted-foreground">
            {member.userId
              ? member.linkedUserName || "Linked"
              : "Shadow profile"}
          </span>
        );
      },
    }),
    columnHelper.accessor("inviteStatus", {
      header: "Invite",
      cell: ({ row }) => {
        const member = row.original;

        if (!member.email) {
          return <span className="text-muted-foreground">No email</span>;
        }

        if (!member.inviteStatus) {
          return <span className="text-muted-foreground">Not sent</span>;
        }

        const label =
          member.inviteStatus === "sent" && member.inviteCompletedAt
            ? "completed"
            : member.inviteStatus;

        return (
          <div className="flex flex-col gap-1">
            <Badge
              variant={
                member.inviteStatus === "completed"
                  ? "default"
                  : member.inviteDeliveryStatus === "bounced" ||
                      member.inviteDeliveryStatus === "complained" ||
                      member.inviteDeliveryStatus === "suppressed"
                    ? "destructive"
                    : "secondary"
              }
              className="w-fit capitalize"
            >
              {label.replace("_", " ")}
            </Badge>
            {member.inviteDeliveryStatus &&
            member.inviteDeliveryStatus !== "sent" &&
            member.inviteDeliveryStatus !== "pending" ? (
              <span className="text-xs text-muted-foreground capitalize">
                Delivery {member.inviteDeliveryStatus.replace("_", " ")}
              </span>
            ) : null}
            {member.inviteSentAt ? (
              <span className="text-xs text-muted-foreground">
                Sent {formatDateTime(member.inviteSentAt)}
              </span>
            ) : null}
            {member.inviteResendAvailableAt &&
            member.inviteResendAvailableAt > new Date() ? (
              <span className="text-xs text-muted-foreground">
                Resend after {formatDateTime(member.inviteResendAvailableAt)}
              </span>
            ) : null}
            {member.inviteLastError ? (
              <span className="text-xs text-destructive">{member.inviteLastError}</span>
            ) : null}
          </div>
        );
      },
    }),
    columnHelper.accessor("createdAt", {
      header: "Created",
      cell: (info) => (
        <span className="text-muted-foreground">
          {formatDateTime(info.getValue())}
        </span>
      ),
    }),
    columnHelper.display({
      id: "actions",
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
            {(member.status === "invited" || member.status === "active") &&
            member.email ? (
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
                  member.inviteDeliveryStatus === "suppressed" ||
                  member.inviteDeliveryStatus === "complained" ||
                  member.inviteDeliveryStatus === "bounced"
                }
              >
                <MailIcon data-icon="inline-start" />
                {member.inviteStatus === "sent" || member.inviteStatus === "failed"
                  ? "Resend invite"
                  : "Send invite"}
              </Button>
            ) : null}
          </div>
        );
      },
    }),
  ];

  const renderToolbarActions = (table: TanStackTable<MemberRow>) => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const selectedCount = selectedRows.length;

    return (
      <div className="flex items-center gap-2">
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
                        memberIds: selectedRows.map((row) => row.original.id),
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
