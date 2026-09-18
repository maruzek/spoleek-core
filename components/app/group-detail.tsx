"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { useFormatters } from "@/components/locale-provider";

import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  ClipboardCheckIcon,
  CloudAlertIcon,
  ExternalLinkIcon,
  LayoutTemplateIcon,
  InboxIcon,
  PlusIcon,
  Settings2Icon,
  ShieldIcon,
  ShieldOffIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { GroupDriftPanel } from "@/components/app/group-drift-panel";
import { GroupForm } from "@/components/app/group-form";
import { GroupJoinRequestsTab } from "@/components/app/group-join-requests-tab";
import type { GroupJoinRequestRow } from "@/server/queries/groups";
import { REPORT_GROUP_STATUS } from "@/lib/membership-report-status";
import type { GroupReportTabView } from "@/server/queries/membership-reports";
import { GroupReportCard } from "@/components/app/group-report-card";
import { GroupWorkspaceLinksCard } from "@/components/app/group-workspace-links-card";
import { GroupAnnouncementEditor } from "@/components/app/portal/group-announcement-editor";
import { GroupResourcesEditor } from "@/components/app/portal/group-resources-editor";
import { MailingListAction } from "@/components/app/mailing-list-action";
import { MemberAdmin } from "@/components/app/member-admin";
import { MemberAssignmentSheet } from "@/components/app/member-assignment-sheet";
import { getMemberDisplayName } from "@/lib/member-custom-fields";
import { getMemberStatusVariant } from "@/lib/member-status-display";
import type { GroupFormValues } from "@/lib/groups";
import type { MembershipStatus } from "@/server/db/schema";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable, SortableHeader } from "@/components/ui/data-table";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  assignGroupAdminAction,
  assignGroupMembersAction,
  removeGroupAdminAction,
  removeGroupMemberAction,
  saveGroupAction,
} from "@/server/actions/groups";
import type { WorkspaceDriftRow } from "@/server/queries/workspace-group-drift";
import type { GroupWorkspaceLinkRow } from "@/server/queries/workspace-group-links";

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
    feeRenewalMonth: number | null;
    feeRenewalDay: number | null;
    feeAmount: number | null;
    feeBankAccount: string | null;
    feePaymentWindowDays: number | null;
    workspaceOrgUnitPath: string | null;
    notifyViaWorkspaceGroup: boolean;
    notificationEmail: string | null;
    categorySpecialCapability: string | null;
    createdAt: Date;
    updatedAt: Date;
    categoryName: string;
    categorySlug: string;
    categoryManagesFees: boolean;
    categoryNotifiesOnRegistration: boolean;
    categoryGroupPagesVisibleToAllMembers: boolean;
    announcement: string | null;
  };
  /** The portal page's links, in order. */
  resources: Array<{ id: string; label: string; url: string }>;
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
  /** Pending and declined join requests; the tab shows when there are any or the policy invites them. */
  requests: GroupJoinRequestRow[];
  /** Tab to open first — the request email deep-links to `requests`. */
  initialTab?: string;
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
  /** Everything the members dashboard needs, already narrowed to this group. */
  membersTable: Pick<
    ComponentProps<typeof MemberAdmin>,
    | "access"
    | "members"
    | "customFields"
    | "memberCategories"
    | "manageableGroupCategories"
    | "workspace"
    | "workspaceProvisionFields"
    | "orgUnitCategoryId"
  >;
  workspaceLinks: GroupWorkspaceLinkRow[];
  workspaceDrift: WorkspaceDriftRow[];
  workspaceDomain: string | null;
  workspaceConnected: boolean;
  canManageWorkspaceIntegration: boolean;
  /** Null when the report module is off or this group is not a reporting group. */
  reportView: GroupReportTabView | null;
  locale: string;
};

const memberColumnHelper =
  createColumnHelper<GroupDetailProps["members"][number]>();

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

export function GroupDetail({
  group,
  members,
  admins,
  requests,
  resources,
  initialTab,
  assignableMembers,
  membersTable,
  workspaceLinks,
  workspaceDrift,
  workspaceDomain,
  workspaceConnected,
  canManageWorkspaceIntegration,
  reportView,
  locale,
}: GroupDetailProps) {
  const { formatDateTime } = useFormatters();

  const openDriftCount = workspaceDrift.filter(
    (row) => row.status === "open",
  ).length;
  const pendingRequestCount = requests.filter((row) => row.status === "pending").length;
  const showRequestsTab = group.joinPolicy === "request_to_join" || requests.length > 0;
  const router = useRouter();
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  const [adminSheetOpen, setAdminSheetOpen] = useState(false);
  const [removalState, setRemovalState] = useState<RemovalState>(null);

  const saveGroup = useAction(saveGroupAction, {
    onSuccess({ data }) {
      if (data?.success) {
        toast.success("Group updated.");
        router.refresh();
      }
    },
  });
  const assignGroupMembers = useAction(assignGroupMembersAction, {
    onSuccess({ data }) {
      if (data?.success) {
        const count = data.requestedCount;
        toast.success(`${count} member${count === 1 ? "" : "s"} assigned.`);
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

  const adminColumns = useMemo(
    () => [
      memberColumnHelper.accessor((row) => getMemberDisplayName(row), {
        id: "member",
        meta: { label: "Member" },
        header: ({ column }) => <SortableHeader column={column}>Member</SortableHeader>,
        filterFn: (row, _id, value: string) =>
          [row.original.firstName, row.original.lastName, row.original.email ?? ""]
            .join(" ")
            .toLowerCase()
            .includes((value ?? "").trim().toLowerCase()),
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
      memberColumnHelper.accessor("status", {
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
      memberColumnHelper.accessor("assignedAt", {
        meta: { label: "Promoted" },
        header: ({ column }) => <SortableHeader column={column}>Promoted</SortableHeader>,
        cell: (info) => (
          <span className="text-sm text-muted-foreground">{formatDateTime(info.getValue())}</span>
        ),
      }),
      memberColumnHelper.display({
        id: "adminActions",
        header: "",
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
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
              <ShieldOffIcon data-icon="inline-start" />
              Demote
            </Button>
          </div>
        ),
      }),
    ],
    [formatDateTime],
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
      <Tabs defaultValue={initialTab === "requests" && showRequestsTab ? "requests" : "members"}>
        <TabsList>
          <TabsTrigger value="members">
            <UsersIcon data-icon="inline-start" />
            Members
          </TabsTrigger>
          <TabsTrigger value="admins">
            <ShieldIcon data-icon="inline-start" />
            Group Admins
          </TabsTrigger>
          {showRequestsTab ? (
            <TabsTrigger value="requests">
              <InboxIcon data-icon="inline-start" />
              Requests
              {pendingRequestCount > 0 ? (
                <span className="relative ml-2 inline-flex">
                  {/* Same ambient glow as the drift badge: a queue that is
                      waiting on a human should be visible from any tab. */}
                  <span className="absolute inset-0 animate-ping rounded-full bg-amber-500/40" />
                  <Badge className="relative border-amber-500/40 bg-amber-500/15 text-amber-700 shadow-[0_0_10px_rgba(245,158,11,0.45)] dark:text-amber-400">
                    {pendingRequestCount}
                  </Badge>
                </span>
              ) : null}
            </TabsTrigger>
          ) : null}
          {workspaceDrift.length > 0 ? (
            <TabsTrigger value="drift">
              <CloudAlertIcon data-icon="inline-start" />
              In Google
              {openDriftCount > 0 ? (
                <span className="relative ml-2 inline-flex">
                  {/* The glow is what makes the count ambient — an admin who
                      never opens this tab still sees that it wants attention. */}
                  <span className="absolute inset-0 animate-ping rounded-full bg-amber-500/40" />
                  <Badge className="relative border-amber-500/40 bg-amber-500/15 text-amber-700 shadow-[0_0_10px_rgba(245,158,11,0.45)] dark:text-amber-400">
                    {openDriftCount}
                  </Badge>
                </span>
              ) : null}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="page">
            <LayoutTemplateIcon data-icon="inline-start" />
            Page
          </TabsTrigger>
          {reportView ? (
            <TabsTrigger value="report">
              <ClipboardCheckIcon data-icon="inline-start" />
              Yearly report
              {reportView.reportGroup &&
              REPORT_GROUP_STATUS[reportView.reportGroup.status]
                .needsAttention ? (
                <Badge variant="destructive" className="ml-2">
                  !
                </Badge>
              ) : null}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="settings">
            <Settings2Icon data-icon="inline-start" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="page" className="flex flex-col gap-4 pt-4">
          {/* Same centred column as Settings: two editors, read top to bottom. */}
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Notice board</CardTitle>
                <CardDescription>
                  A note from the leaders at the top of the group&apos;s portal page. Everyone who
                  can open the page sees it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GroupAnnouncementEditor
                  key={`${group.id}-${group.updatedAt.toISOString()}`}
                  groupId={group.id}
                  initialHtml={group.announcement ?? ""}
                  variant="inline"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Links &amp; resources</CardTitle>
                <CardDescription>
                  Where the group lives outside Spoleek — a chat, a shared folder, a calendar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GroupResourcesEditor
                  key={`${group.id}-${resources.map((r) => r.id).join(",")}`}
                  groupId={group.id}
                  resources={resources}
                  variant="inline"
                />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button asChild variant="outline" size="sm">
                <a href={`/portal/groups/${group.slug}`} target="_blank" rel="noopener noreferrer">
                  View as member
                  <ExternalLinkIcon data-icon="inline-end" />
                </a>
              </Button>
            </div>
          </div>
        </TabsContent>

        {reportView ? (
          <TabsContent value="report" className="flex flex-col gap-4 pt-4">
            <GroupReportCard
              view={reportView}
              groupName={group.name}
              locale={locale}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="members" className="flex flex-col gap-4 pt-4">
          <MemberAdmin
            {...membersTable}
            groupContext={{
              groupId: group.id,
              onAddMembers: () => setMemberSheetOpen(true),
              onRemoveMember: ({ id, name }) =>
                setRemovalState({ kind: "member", memberId: id, label: name }),
            }}
          />
        </TabsContent>

        {showRequestsTab ? (
          <TabsContent value="requests" className="flex flex-col gap-4 pt-4">
            <GroupJoinRequestsTab groupId={group.id} requests={requests} />
          </TabsContent>
        ) : null}

        <TabsContent value="admins" className="flex flex-col gap-4 pt-4">
          <DataTable
            data={admins}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            columns={adminColumns as any}
            searchKey="member"
            searchPlaceholder="Search group admins..."
            onRowClick={(admin) => router.push(`/admin/members/${admin.memberId}`)}
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

        {workspaceDrift.length > 0 ? (
          <TabsContent value="drift" className="flex flex-col gap-4 pt-4">
            <GroupDriftPanel
              rows={workspaceDrift}
              canManage={canManageWorkspaceIntegration}
              workspaceDomain={workspaceDomain}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="settings" className="flex flex-col gap-6 pt-4">
          {/* The one centred surface in the app: a long form reads better as a
              column than stretched across the full width. */}
          <Card className="mx-auto w-full max-w-2xl overflow-hidden">
            <CardHeader>
              <CardTitle>Group settings</CardTitle>
              <CardDescription>
                Last saved {formatDateTime(group.updatedAt)}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GroupForm
                key={`${group.id}-${group.updatedAt.toISOString()}`}
                categoryId={group.categoryId}
                group={group}
                isPending={saveGroup.isPending}
                validationErrors={saveGroup.result.validationErrors}
                categoryManagesFees={group.categoryManagesFees}
                workspaceConnected={workspaceConnected}
                canManageWorkspaceIntegration={canManageWorkspaceIntegration}
                isWorkspaceOrgUnitCategory={group.categorySpecialCapability === "workspace_org_unit"}
                linkedWorkspaceGroupEmail={
                  workspaceLinks.find((link) => link.isEnabled)?.workspaceGroupEmail ?? null
                }
                categoryNotifiesOnRegistration={group.categoryNotifiesOnRegistration}
                categoryGroupPagesVisibleToAllMembers={group.categoryGroupPagesVisibleToAllMembers}
                submitLabel="Save group"
                onSubmit={async (value: GroupFormValues) => {
                  const result = await saveGroup.executeAsync(value);

                  if (result?.serverError) {
                    toast.error(result.serverError);
                  }
                }}
              />
            </CardContent>
          </Card>

          <div className="mx-auto w-full max-w-2xl">
            <GroupWorkspaceLinksCard
              groupId={group.id}
              links={workspaceLinks}
              workspaceConnected={workspaceConnected}
              canManage={canManageWorkspaceIntegration}
            />
          </div>
        </TabsContent>
      </Tabs>

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

      <AlertDialog
        open={removalState != null}
        onOpenChange={(open) => !open && setRemovalState(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removalState?.kind === "admin"
                ? "Demote group admin?"
                : "Remove group member?"}
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
