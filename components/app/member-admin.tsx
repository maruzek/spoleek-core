"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  createColumnHelper,
  type Table as TanStackTable,
} from "@tanstack/react-table";
import {
  AlertTriangleIcon,
  BanknoteIcon,
  MailIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
  UserRoundCheckIcon,
  UserRoundXIcon,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/ui/data-table";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { useAppShell } from "@/components/app/app-shell-provider";
import { formatDateTime } from "@/lib/format";
import { formatFeeAmount } from "@/lib/payments";
import { copyToClipboard } from "@/utils/copy";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import {
  approveMemberAction,
  bulkDeleteMembersAction,
  createShadowMemberAction,
  provisionMemberWorkspaceAccountAction,
  rejectMemberAction,
  resendMemberInviteAction,
} from "@/server/actions/member-admin";
import type { MemberCustomField, TenantMember } from "@/server/db/schema";
import type {
  MemberAdminAccess,
  MemberOverdueFees,
  MemberGroupAssignment,
  MemberInviteState,
  MembersTableCategory,
} from "@/server/queries/members";
import type { MemberManagementGroupCategory } from "@/server/lib/member-management-scope";
import { MemberImportDialog } from "./member-import/index";
import { MailingListAction } from "./mailing-list-action";
import {
  MemberApproveWorkspaceDialog,
  type EnabledProvisionField,
  type WorkspaceApprovalMember,
} from "./member-approve-workspace-dialog";
import { MemberSheet } from "./member-sheet";

type WorkspaceModuleProp = {
  enabled: boolean;
  connected: boolean;
  domain: string | null;
  /** Org country, used to complete phone numbers written in local form. */
  countryCode?: string;
};

type VisibleMemberStatus = Exclude<TenantMember["status"], "deleted">;

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  workspaceUserEmail: string | null;
  preferredEmail: "personal" | "workspace" | null;
  role: "member" | "leader" | "org_admin";
  status: VisibleMemberStatus;
  userId: string | null;
  createdAt: Date;
  primaryGroup: MemberGroupAssignment | null;
  customFieldValues: Record<string, string>;
  groupAssignmentsByCategory: Record<string, MemberGroupAssignment[]>;
  inviteState: MemberInviteState;
  /** Derived from member_payments; null when nothing is overdue. */
  overdueFees: MemberOverdueFees | null;
};

function resolvePreferredEmailForRow(
  row: Pick<MemberRow, "email" | "workspaceUserEmail" | "preferredEmail">,
  orgDefault: "personal" | "workspace",
  workspaceReady: boolean,
): string | null {
  const effective = row.preferredEmail ?? orgDefault;
  if (effective === "workspace" && workspaceReady && row.workspaceUserEmail) {
    return row.workspaceUserEmail;
  }
  return row.email;
}

const columnHelper = createColumnHelper<MemberRow>();

function getStatusVariant(status: VisibleMemberStatus) {
  if (status === "active") {
    return "success";
  }

  if (status === "suspended") {
    return "error";
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
  access,
  members,
  customFields,
  memberCategories,
  manageableGroupCategories,
  workspace,
  workspaceProvisionFields = [],
  groupsById,
  orgUnitCategoryId,
}: {
  access: MemberAdminAccess;
  members: MemberRow[];
  customFields: MemberCustomField[];
  memberCategories: MembersTableCategory[];
  manageableGroupCategories: MemberManagementGroupCategory[];
  workspace: WorkspaceModuleProp;
  workspaceProvisionFields?: EnabledProvisionField[];
  groupsById?: Map<string, { id: string; name: string; categoryId: string; workspaceOrgUnitPath: string | null }>;
  orgUnitCategoryId?: string | null;
}) {
  const router = useRouter();
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [workspaceApproveMember, setWorkspaceApproveMember] =
    useState<WorkspaceApprovalMember | null>(null);
  // The member whose Workspace account is being set up right after creation.
  const [workspaceProvisionMember, setWorkspaceProvisionMember] =
    useState<WorkspaceApprovalMember | null>(null);
  const [workspaceProvisionError, setWorkspaceProvisionError] = useState<
    string | null
  >(null);
  /**
   * Survives the create round-trip: the identity is known from the submitted
   * form, but the member id only comes back from the action.
   */
  const pendingProvisionRef = useRef<Omit<
    WorkspaceApprovalMember,
    "id"
  > | null>(null);
  const [workspaceApproveError, setWorkspaceApproveError] = useState<
    string | null
  >(null);
  // A single useAction hook backs every Approve button, so `isPending` alone
  // would grey out all of them. Track the member actually being approved.
  const [approvingMemberId, setApprovingMemberId] = useState<string | null>(
    null,
  );
  // The pending applicant whose rejection dialog is open, plus the reason the
  // admin is composing for them. Held here so the dialog survives table redraws.
  const [rejectMember, setRejectMember] = useState<{
    id: string;
    name: string;
    email: string | null;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // Member awaiting the "Workspace is not connected" warning decision.
  const [unconnectedWarningMember, setUnconnectedWarningMember] =
    useState<WorkspaceApprovalMember | null>(null);
  const workspaceReady =
    workspace.enabled && workspace.connected && Boolean(workspace.domain);
  /** Module switched on, but the OAuth connection was never completed. */
  const workspaceMisconfigured = workspace.enabled && !workspaceReady;
  const { organization } = useAppShell();
  const { defaultEmailPreference } = organization;

  /** The member record lives on its own route now, not in a side sheet. */
  const openMember = useCallback(
    (memberId: string) => {
      router.push(`/admin/members/${memberId}`);
    },
    [router],
  );

  const createAction = useAction(createShadowMemberAction, {
    onSuccess({ data }) {
      // A rejected custom-field answer means nothing was created — keep the
      // sheet open with the errors attached to their fields.
      if (data && !data.success) {
        // Show the message itself, not just "check the fields" — an error the
        // form has no input for would otherwise be invisible.
        const messages = Object.values(data.customFieldErrors ?? {}).flat();
        toast.error(messages[0] ?? "Some custom field answers were rejected.");
        return;
      }

      const pending = pendingProvisionRef.current;
      pendingProvisionRef.current = null;

      setSheetOpen(false);
      toast.success("Member created.");
      router.refresh();

      // The admin asked for a Workspace account while creating the member. The
      // member exists now, so the ordinary provisioning dialog can take over —
      // same fields, same auto-fill, as when approving someone.
      if (pending && data?.memberId && workspaceReady) {
        setWorkspaceProvisionError(null);
        setWorkspaceProvisionMember({ id: data.memberId, ...pending });
      }
    },
  });

  const provisionAction = useAction(provisionMemberWorkspaceAccountAction, {
    onSuccess({ data }) {
      if (!data?.success) {
        const error = data?.error ?? "Could not create the account.";
        setWorkspaceProvisionError(error);
        toast.error(error);
        return;
      }

      setWorkspaceProvisionMember(null);
      setWorkspaceProvisionError(null);
      toast.success(`Workspace account created for ${data.primaryEmail}.`);
      router.refresh();
    },
    onError({ error }) {
      const message =
        error.serverError ?? "Could not create the Workspace account.";
      setWorkspaceProvisionError(message);
      toast.error(message);
    },
  });
  const approveAction = useAction(approveMemberAction, {
    onSettled() {
      setApprovingMemberId(null);
    },
    onSuccess({ data }) {
      if (!data?.success) {
        const error = data?.workspace?.error;
        if (error) {
          setWorkspaceApproveError(error);
          toast.error(error);
        }
        return;
      }
      if ("workspace" in data && data.workspace) {
        setWorkspaceApproveMember(null);
        setWorkspaceApproveError(null);
        toast.success(
          `Member approved. Workspace account created for ${data.workspace.primaryEmail}.`,
        );
        router.refresh();
        return;
      }
      // Approved without a Google account (skipped, or module not connected).
      setWorkspaceApproveMember(null);
      setWorkspaceApproveError(null);

      if (data.inviteReason === "cooldown") {
        toast.error(
          "The invite was not resent because the resend cooldown is still active.",
        );
      } else if (data.inviteReason === "already-completed") {
        toast.success("Member approved. This account was already activated.");
      } else if (data.inviteReason === "suppressed") {
        toast.error(
          "Member approved, but the invite email is blocked due to a bounce, complaint, or suppression.",
        );
      } else if (data.inviteSent) {
        toast.success("Member approved and activation email sent.");
      } else {
        toast.success("Member approved.");
      }

      router.refresh();
    },
    onError({ error }) {
      if (error.serverError) {
        setWorkspaceApproveError(error.serverError);
      }
    },
  });
  /**
   * The one way to approve a member. Both the table row and the edit sheet go
   * through here so the Workspace provisioning dialog is never skipped.
   */
  const startApproval = useCallback(
    (member: WorkspaceApprovalMember) => {
      setWorkspaceApproveError(null);

      if (workspaceReady) {
        setWorkspaceApproveMember(member);
        return;
      }

      if (workspaceMisconfigured) {
        setUnconnectedWarningMember(member);
        return;
      }

      setApprovingMemberId(member.id);
      approveAction.execute({ memberId: member.id, role: member.role });
    },
    [approveAction, workspaceMisconfigured, workspaceReady],
  );

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
  const rejectAction = useAction(rejectMemberAction, {
    onSuccess({ data }) {
      if (!data || data.deletedCount === 0) {
        toast.error("This application could not be rejected.");
        return;
      }

      setRejectMember(null);
      setRejectReason("");
      toast.success("Application rejected. The applicant has been emailed.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not reject this application.");
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

  // The unpaid-fees column and its filter both hang off this: with nothing
  // overdue there is nothing to show, so the column is omitted rather than
  // rendered as a full stripe of em dashes. Same treatment the workspace-email
  // column gets.
  const membersWithOverdueFees = useMemo(
    () => members.filter((member) => member.overdueFees !== null).length,
    [members],
  );

  const columns = useMemo(() => {
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
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
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
              <Link
                href={`/admin/members/${member.id}`}
                className="flex min-w-0 max-w-[18rem] flex-col gap-1 rounded-md text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <span className="truncate font-medium text-foreground underline-offset-4 hover:underline">
                  {getMemberDisplayName(member)}
                </span>
              </Link>
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
              onClick={() => {
                void copyToClipboard(email).then((ok) => {
                  if (ok) toast.success("Personal email copied.");
                  else toast.error("Could not copy email.");
                });
              }}
              className="block max-w-[16rem] truncate rounded-md text-left text-sm text-foreground underline-offset-4 outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
              aria-label={`Copy personal email ${email}`}
              title="Click to copy"
            >
              {email}
            </button>
          );
        },
      }),
    ];

    if (membersWithOverdueFees > 0) {
      baseColumns.push(
        columnHelper.display({
          id: "overdue-fees",
          meta: { label: "Unpaid fees" },
          header: "Unpaid fees",
          // Amounts owed are ranked on the payments dashboard; here the column
          // is a flag and a filter, so sorting it would only fight the status
          // ordering the roster is built around.
          enableSorting: false,
          // Unpaid fees are their own axis, not a member status: a member can
          // be active and behind on fees, or suspended by an admin and fully
          // paid up.
          filterFn: (row, _columnId, filterValue) =>
            filterValue ? row.original.overdueFees !== null : true,
          cell: ({ row }) => {
            const overdueFees = row.original.overdueFees;

            if (!overdueFees) {
              return <span className="text-sm text-muted-foreground">—</span>;
            }

            return (
              <div className="flex min-w-0 flex-col gap-1">
                <Badge variant="destructive" className="w-fit">
                  {overdueFees.overdueCount} unpaid
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatFeeAmount(overdueFees.overdueAmountCents, overdueFees.currency)}
                  {overdueFees.daysOverdue > 0 ? ` · ${overdueFees.daysOverdue} days late` : null}
                </span>
              </div>
            );
          },
        }),
      );
    }

    if (workspaceReady) {
      baseColumns.push(
        columnHelper.display({
          id: "workspace-email",
          meta: { label: "Workspace Email" },
          header: "Workspace Email",
          cell: ({ row }) => {
            const wsEmail = row.original.workspaceUserEmail;
            if (!wsEmail) {
              return <span className="text-sm text-muted-foreground">—</span>;
            }
            return (
              <button
                type="button"
                onClick={() => {
                  void copyToClipboard(wsEmail).then((ok) => {
                    if (ok) toast.success("Workspace email copied.");
                    else toast.error("Could not copy email.");
                  });
                }}
                className="block max-w-[16rem] truncate rounded-md text-left text-sm text-foreground underline-offset-4 outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                aria-label={`Copy workspace email ${wsEmail}`}
                title="Click to copy"
              >
                {wsEmail}
              </button>
            );
          },
        }),
      );

      baseColumns.push(
        columnHelper.display({
          id: "preferred-email",
          meta: { label: "Preferred Email" },
          header: "Preferred Email",
          cell: ({ row }) => {
            const resolved = resolvePreferredEmailForRow(
              row.original,
              defaultEmailPreference,
              workspaceReady,
            );
            return resolved ? (
              <span className="block max-w-[16rem] truncate text-sm text-foreground">
                {resolved}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            );
          },
        }),
      );
    }

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
            assignments={
              row.original.groupAssignmentsByCategory[category.id] ?? []
            }
          />
        ),
      }),
    );

    const customFieldColumns = customFields
      .filter((field) => field.discoveryMode !== "hidden")
      .map((field) =>
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
              {member.status === "pending" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={() =>
                    startApproval({
                      id: member.id,
                      firstName: member.firstName,
                      lastName: member.lastName,
                      email: member.email,
                      role: member.role,
                    })
                  }
                  disabled={approvingMemberId === member.id}
                >
                  <UserRoundCheckIcon data-icon="inline-start" />
                  {approvingMemberId === member.id ? "Approving..." : "Approve"}
                </Button>
              ) : null}
              {member.status === "pending" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setRejectReason("");
                    setRejectMember({
                      id: member.id,
                      name:
                        `${member.firstName} ${member.lastName}`.trim() ||
                        member.email ||
                        "this applicant",
                      email: member.email,
                    });
                  }}
                  disabled={approvingMemberId === member.id}
                >
                  <UserRoundXIcon data-icon="inline-start" />
                  Reject
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
              <Button size="sm" variant="outline" asChild>
                <Link href={`/admin/members/${member.id}`}>
                  <PencilIcon data-icon="inline-start" />
                  Open
                </Link>
              </Button>
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
  }, [
    approvingMemberId,
    startApproval,
    defaultEmailPreference,
    customFields,
    memberCategories,
    membersWithOverdueFees,
    resendInviteAction,
    workspaceReady,
  ]);

  const initialColumnVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {
      "personal-email": false,
      "workspace-email": false,
    };
    for (const field of customFields) {
      if (field.discoveryMode === "available") {
        visibility[`field-${field.key}`] = false;
      }
    }
    return visibility;
  }, [customFields]);

  const renderToolbarActions = (table: TanStackTable<MemberRow>) => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const selectedCount = selectedRows.length;
    const overdueColumn = table.getColumn("overdue-fees");
    const overdueOnly = Boolean(overdueColumn?.getFilterValue());

    return (
      <div className="flex items-center gap-2">
        {overdueColumn ? (
          <Button
            type="button"
            variant={overdueOnly ? "default" : "outline"}
            aria-pressed={overdueOnly}
            onClick={() =>
              overdueColumn?.setFilterValue(overdueOnly ? undefined : true)
            }
          >
            <BanknoteIcon data-icon="inline-start" />
            Unpaid fees
            <Badge variant={overdueOnly ? "secondary" : "destructive"} className="ml-2">
              {membersWithOverdueFees}
            </Badge>
          </Button>
        ) : null}
        <MailingListAction
          scope={{ kind: "members-admin" }}
          table={table}
          getMemberId={(member) => member.id}
          showWorkspaceOptions={workspaceReady}
        />
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <UploadIcon data-icon="inline-start" />
          Import
        </Button>
        <Button onClick={() => setSheetOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          {access.level === "full" ? "New member" : "New scoped member"}
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
                        memberIds: selectedRows.map(
                          (selectedRow) => selectedRow.original.id,
                        ),
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
        emptyStateDescription={
          access.level === "full"
            ? "Create members or invite them via the portal."
            : "Create members directly into the groups you administer."
        }
        initialColumnVisibility={initialColumnVisibility}
        toolbarActions={renderToolbarActions}
        onRowClick={(member) => openMember(member.id)}
      />

      <MemberSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        isPending={createAction.isPending}
        accessLevel={access.level}
        roleOptions={access.roleOptions}
        manageableGroupCategories={manageableGroupCategories}
        customFields={customFields}
        customFieldErrors={createAction.result.data?.customFieldErrors}
        workspaceReady={workspaceReady}
        serverError={createAction.result.serverError}
        validationErrors={createAction.result.validationErrors}
        onSubmit={async (value, options) => {
          pendingProvisionRef.current = options.createWorkspaceAccount
            ? {
                firstName: value.firstName,
                lastName: value.lastName,
                email: value.email || null,
                role: value.role,
              }
            : null;
          const result = await createAction.executeAsync(value);
          return Boolean(result?.data?.success);
        }}
      />

      <MemberApproveWorkspaceDialog
        mode="provision"
        open={Boolean(workspaceProvisionMember)}
        onOpenChange={(open) => {
          if (!open) {
            setWorkspaceProvisionMember(null);
            setWorkspaceProvisionError(null);
          }
        }}
        member={workspaceProvisionMember}
        workspaceDomain={workspace.domain ?? ""}
        defaultPhoneCountry={workspace.countryCode}
        isPending={provisionAction.isPending}
        submitError={workspaceProvisionError}
        provisionFields={workspaceProvisionFields}
        onSkip={() => {
          setWorkspaceProvisionMember(null);
          setWorkspaceProvisionError(null);
        }}
        onConfirm={async ({ primaryEmail, extraFields }) => {
          if (!workspaceProvisionMember) return;
          setWorkspaceProvisionError(null);
          await provisionAction.executeAsync({
            memberId: workspaceProvisionMember.id,
            primaryEmail,
            extraFields,
          });
        }}
      />

      <MemberImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        customFields={customFields}
        manageableGroupCategories={manageableGroupCategories}
        workspaceReady={workspaceReady}
        workspaceProvisionFields={workspaceProvisionFields}
        groupsById={groupsById}
        orgUnitCategoryId={orgUnitCategoryId}
        defaultPhoneCountry={workspace.countryCode}
        onDone={() => router.refresh()}
      />

      <AlertDialog
        open={Boolean(unconnectedWarningMember)}
        onOpenChange={(open) => {
          if (!open) setUnconnectedWarningMember(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Google Workspace is not connected
            </AlertDialogTitle>
            <AlertDialogDescription>
              The Workspace module is enabled, but the Google connection was
              never completed — so approving{" "}
              {unconnectedWarningMember
                ? `${unconnectedWarningMember.firstName} ${unconnectedWarningMember.lastName}`.trim()
                : "this member"}{" "}
              will activate their membership without creating a Google account.
              You can connect Workspace first and approve afterwards, or
              approve now and provision the account later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" asChild>
              <Link href="/admin/settings?tab=workspace">
                Set up connection
              </Link>
            </Button>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (!unconnectedWarningMember) return;
                setApprovingMemberId(unconnectedWarningMember.id);
                approveAction.execute({
                  memberId: unconnectedWarningMember.id,
                  role: unconnectedWarningMember.role,
                  acknowledgeWorkspaceUnavailable: true,
                });
                setUnconnectedWarningMember(null);
              }}
            >
              <UserRoundCheckIcon data-icon="inline-start" />
              Approve without account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemberApproveWorkspaceDialog
        open={Boolean(workspaceApproveMember)}
        onOpenChange={(open) => {
          if (!open) {
            setWorkspaceApproveMember(null);
            setWorkspaceApproveError(null);
          }
        }}
        member={workspaceApproveMember}
        workspaceDomain={workspace.domain ?? ""}
        defaultPhoneCountry={workspace.countryCode}
        isPending={approveAction.isPending}
        submitError={workspaceApproveError}
        provisionFields={workspaceProvisionFields}
        onSkip={() => {
          if (!workspaceApproveMember) return;
          setWorkspaceApproveError(null);
          setApprovingMemberId(workspaceApproveMember.id);
          approveAction.execute({
            memberId: workspaceApproveMember.id,
            role: workspaceApproveMember.role,
            skipWorkspaceAccount: true,
          });
        }}
        onConfirm={async ({ primaryEmail, extraFields }) => {
          if (!workspaceApproveMember) return;
          setWorkspaceApproveError(null);
          setApprovingMemberId(workspaceApproveMember.id);
          await approveAction.executeAsync({
            memberId: workspaceApproveMember.id,
            role: workspaceApproveMember.role,
            workspace: { primaryEmail, extraFields },
          });
        }}
      />

      <AlertDialog
        open={rejectMember !== null}
        onOpenChange={(open) => {
          if (!open && !rejectAction.isPending) {
            setRejectMember(null);
            setRejectReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <UserRoundXIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Reject {rejectMember?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {rejectMember?.email
                ? `This permanently deletes the application and every answer they gave. We will email ${rejectMember.email} to say it was not accepted. They can apply again later.`
                : "This permanently deletes the application and every answer they gave. The applicant has no email address, so no message will be sent."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="reject-reason">Reason (optional)</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              maxLength={600}
              rows={3}
              placeholder="We are at capacity for this season."
              disabled={rejectAction.isPending}
            />
            <p className="text-sm text-muted-foreground">
              {rejectMember?.email
                ? "Shown to the applicant word for word. Leave it empty to send the decision without an explanation."
                : "Nothing is stored after the deletion, so this reason will not be kept."}
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejectAction.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={rejectAction.isPending}
              onClick={(event) => {
                event.preventDefault();

                if (!rejectMember) return;

                rejectAction.execute({
                  memberId: rejectMember.id,
                  reason: rejectReason,
                });
              }}
            >
              {rejectAction.isPending ? "Rejecting..." : "Reject application"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
