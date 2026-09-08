"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useFormatters } from "@/components/locale-provider";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CircleAlertIcon,
  HistoryIcon,
  MailIcon,
  PencilIcon,
  Trash2Icon,
  UserRoundCheckIcon,
  UserRoundIcon,
  UserRoundXIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  MemberApproveWorkspaceDialog,
  type EnabledProvisionField,
  type WorkspaceApprovalMember,
} from "@/components/app/member-approve-workspace-dialog";
import { MemberDataExportButton } from "@/components/app/member-data-export-button";
import { MemberActivityTab } from "@/components/app/member-detail/member-activity-tab";
import { MemberDetailHeader } from "@/components/app/member-detail/member-detail-header";
import { MemberEmailsTab } from "@/components/app/member-detail/member-emails-tab";
import { MemberGroupsTab } from "@/components/app/member-detail/member-groups-tab";
import { MemberOverviewTab } from "@/components/app/member-detail/member-overview-tab";
import { MemberPaymentsTab } from "@/components/app/member-detail/member-payments-tab";
import { MemberProfileForm } from "@/components/app/member-detail/member-profile-form";
import { MemberStatusBanner } from "@/components/app/member-detail/member-status-banner";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatFeeAmount } from "@/lib/payments";
import { cn } from "@/lib/utils";
import {
  approveMemberAction,
  deleteMemberAction,
  provisionMemberWorkspaceAccountAction,
  rejectMemberAction,
  resendMemberInviteAction,
  updateMemberAction,
} from "@/server/actions/member-admin";
import type { TenantMember } from "@/server/db/schema";
import type { MemberDetailData } from "@/server/queries/member-detail";

const VALID_TABS = [
  "overview",
  "payments",
  "groups",
  "activity",
  "emails",
] as const;
type TabValue = (typeof VALID_TABS)[number];

function toValidTab(tab: string | undefined): TabValue {
  return VALID_TABS.includes(tab as TabValue) ? (tab as TabValue) : "overview";
}

/**
 * Every tab body shares one wrapper. Without it each tab picked its own
 * max-width, which made the centred empty states land in a different place per
 * tab. `wide` is for the tabs that hold a full-width table.
 */
function TabBody({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("pt-6", wide ? "w-full" : "max-w-3xl")}>{children}</div>
  );
}

/**
 * A count belongs next to the thing it counts, so the tab strip carries the
 * numbers the header banner used to. Rendered as a plain numeric suffix — a
 * Badge would not fit inside the 8-unit tall tab trigger.
 */
function TabCount({ value }: { value: number }) {
  if (value === 0) {
    return null;
  }

  return (
    <span className="text-xs font-normal tabular-nums text-muted-foreground">
      {value}
    </span>
  );
}

export function MemberDetailView({
  data,
  workspaceProvisionFields,
  defaultTab,
}: {
  data: MemberDetailData;
  workspaceProvisionFields: EnabledProvisionField[];
  defaultTab?: string;
}) {
  const { formatDate } = useFormatters();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { access, editor, workspace } = data;
  // `getMemberById` filters deleted rows out, so the narrower status the header
  // and the edit form expect is an invariant of this route, not an assumption.
  const member = editor.member as Omit<TenantMember, "status"> & {
    status: Exclude<TenantMember["status"], "deleted">;
  };
  const displayName =
    [member.firstName, member.lastName].filter(Boolean).join(" ").trim() ||
    member.email ||
    "this member";

  const [activeTab, setActiveTab] = useState<TabValue>(toValidTab(defaultTab));
  const [isEditing, setIsEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [workspaceApproveOpen, setWorkspaceApproveOpen] = useState(false);
  const [workspaceProvisionOpen, setWorkspaceProvisionOpen] = useState(false);
  const [workspaceProvisionError, setWorkspaceProvisionError] = useState<
    string | null
  >(null);
  const [unconnectedWarningOpen, setUnconnectedWarningOpen] = useState(false);
  const [underAgeWarningOpen, setUnderAgeWarningOpen] = useState(false);
  // Sticky for the rest of the visit: once the admin has confirmed, the
  // Workspace dialogs must not ask again on their way through.
  const [underAgeConfirmed, setUnderAgeConfirmed] = useState(false);
  const [workspaceApproveError, setWorkspaceApproveError] = useState<
    string | null
  >(null);

  const workspaceReady =
    workspace.enabled && workspace.connected && Boolean(workspace.domain);
  const workspaceMisconfigured = workspace.enabled && !workspaceReady;
  const canDelete = member.role !== "org_admin";

  const approvalMember: WorkspaceApprovalMember = {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    role: member.role,
  };

  const promotedGroups = useMemo(
    () =>
      editor.metadata.groupAssignments.filter(
        (assignment) => assignment.categoryShowInMembersTable,
      ),
    [editor.metadata.groupAssignments],
  );

  const replaceParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const handleTabChange = useCallback(
    (value: string) => {
      const tab = toValidTab(value);
      setActiveTab(tab);

      replaceParams((params) => {
        if (tab === "overview") {
          params.delete("tab");
        } else {
          params.set("tab", tab);
        }
        // Leaving the Emails tab should not leave a detail sheet armed.
        params.delete("email");
      });
    },
    [replaceParams],
  );

  /** Server-driven, so a link to one email opens the same sheet elsewhere. */
  const handleOpenEmail = useCallback(
    (emailId: string | null) => {
      replaceParams((params) => {
        if (emailId) {
          params.set("email", emailId);
        } else {
          params.delete("email");
        }
      });
    },
    [replaceParams],
  );

  const updateAction = useAction(updateMemberAction, {
    onSuccess() {
      setIsEditing(false);
      toast.success("Member updated.");
      router.refresh();
    },
  });

  const approveAction = useAction(approveMemberAction, {
    onSuccess({ data: result }) {
      if (!result?.success) {
        const error = result?.workspace?.error;
        if (error) {
          setWorkspaceApproveError(error);
          toast.error(error);
        }
        return;
      }

      if ("workspace" in result && result.workspace) {
        setWorkspaceApproveOpen(false);
        setWorkspaceApproveError(null);
        toast.success(
          `Member approved. Workspace account created for ${result.workspace.primaryEmail}.`,
        );
        router.refresh();
        return;
      }

      if (result.inviteReason === "cooldown") {
        toast.error(
          "The invite was not resent because the resend cooldown is still active.",
        );
      } else if (result.inviteReason === "already-completed") {
        toast.success("Member approved. This account was already activated.");
      } else if (result.inviteReason === "suppressed") {
        toast.error(
          "Member approved, but the invite email is blocked due to a bounce, complaint, or suppression.",
        );
      } else if (result.inviteSent) {
        toast.success("Member approved and activation email sent.");
      } else {
        toast.success("Member approved.");
      }

      setWorkspaceApproveOpen(false);
      router.refresh();
    },
    onError({ error }) {
      if (error.serverError) {
        setWorkspaceApproveError(error.serverError);
        toast.error(error.serverError);
      }
    },
  });

  const provisionAction = useAction(provisionMemberWorkspaceAccountAction, {
    onSuccess({ data: result }) {
      if (!result?.success) {
        const error = result?.error ?? "Could not create the account.";
        setWorkspaceProvisionError(error);
        toast.error(error);
        return;
      }

      setWorkspaceProvisionOpen(false);
      setWorkspaceProvisionError(null);
      toast.success(`Workspace account created for ${result.primaryEmail}.`);
      router.refresh();
    },
    onError({ error }) {
      const message =
        error.serverError ?? "Could not create the Workspace account.";
      setWorkspaceProvisionError(message);
      toast.error(message);
    },
  });

  const rejectAction = useAction(rejectMemberAction, {
    onSuccess({ data: result }) {
      if (!result || result.deletedCount === 0) {
        toast.error("This application could not be rejected.");
        return;
      }

      toast.success("Application rejected. The applicant has been emailed.");
      router.push("/admin/members");
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not reject this application.");
    },
  });

  const deleteAction = useAction(deleteMemberAction, {
    onSuccess({ data: result }) {
      if (!result) {
        return;
      }

      if (result.deletedCount > 0) {
        toast.success("Member deleted.");
        router.push("/admin/members");
        return;
      }

      if (result.skippedProtectedCount > 0) {
        toast.error(
          "This is the last org admin. Promote another admin first, then delete this one.",
        );
        return;
      }

      toast.error("Member was already deleted or unavailable.");
    },
  });

  const resendInviteAction = useAction(resendMemberInviteAction, {
    onSuccess({ data: result }) {
      if (!result) {
        return;
      }

      if (result.sent) {
        toast.success("Activation email sent.");
        router.refresh();
        return;
      }

      const message =
        result.reason === "cooldown"
          ? "Invite resend is cooling down. Wait a few minutes before trying again."
          : result.reason === "already-completed"
            ? "This member already completed account activation."
            : result.reason === "already-active"
              ? "This member is already linked and does not need another invite."
              : result.reason === "suppressed"
                ? "Email delivery is blocked for this address due to a bounce, complaint, or suppression."
                : "The current activation email is still valid, so a new one was not sent.";

      toast.error(message);
      router.refresh();
    },
  });

  /**
   * Approval always routes through here so the Workspace provisioning dialog
   * can never be bypassed, exactly as it works from the members table.
   */
  /**
   * The approval itself, once the age question is settled. `acknowledgeUnderAge`
   * is threaded through every branch because the server refuses without it —
   * the flag has to survive the Workspace dialogs, not just the direct path.
   */
  const proceedWithApproval = useCallback(
    (acknowledgeUnderAge: boolean) => {
      setWorkspaceApproveError(null);

      if (workspaceReady) {
        setWorkspaceApproveOpen(true);
        return;
      }

      if (workspaceMisconfigured) {
        setUnconnectedWarningOpen(true);
        return;
      }

      approveAction.execute({
        memberId: member.id,
        role: member.role,
        acknowledgeUnderAge,
      });
    },
    [
      approveAction,
      member.id,
      member.role,
      workspaceMisconfigured,
      workspaceReady,
    ],
  );

  const startApproval = useCallback(() => {
    // Asked first, ahead of any Workspace question: whether this person may be
    // a member at all outranks which account they get.
    if (data.ageSignal?.isUnderAge && !underAgeConfirmed) {
      setUnderAgeWarningOpen(true);
      return;
    }

    proceedWithApproval(underAgeConfirmed);
  }, [data.ageSignal, proceedWithApproval, underAgeConfirmed]);

  const canResendInvite =
    member.status === "invited" &&
    Boolean(member.email) &&
    editor.metadata.inviteState.status !== "completed" &&
    !member.userId;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/members">
            <ArrowLeftIcon data-icon="inline-start" />
            All members
          </Link>
        </Button>
      </div>

      <MemberDetailHeader
        member={member}
        linkedUserName={editor.metadata.linkedUserName}
        promotedGroups={promotedGroups}
        actions={
          <>
            {member.status === "pending" ? (
              <>
                <Button onClick={startApproval} disabled={approveAction.isPending}>
                  <UserRoundCheckIcon data-icon="inline-start" />
                  {approveAction.isPending ? "Approving..." : "Approve"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRejectReason("");
                    setRejectOpen(true);
                  }}
                  disabled={rejectAction.isPending}
                >
                  <UserRoundXIcon data-icon="inline-start" />
                  Reject
                </Button>
              </>
            ) : null}

            {canResendInvite ? (
              <Button
                variant="outline"
                onClick={() =>
                  resendInviteAction.execute({ memberId: member.id })
                }
                disabled={resendInviteAction.isPending}
              >
                <MailIcon data-icon="inline-start" />
                Resend invite
              </Button>
            ) : null}

            {/*
              For the access request that arrives by email anyway, and for a
              member with no login to click it themselves.
            */}
            <MemberDataExportButton mode="admin" memberId={member.id} />


            {isEditing ? null : (
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(true);
                  handleTabChange("overview");
                }}
              >
                <PencilIcon data-icon="inline-start" />
                Edit profile
              </Button>
            )}

            {canDelete ? (
              <Button
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={deleteAction.isPending}
              >
                <Trash2Icon data-icon="inline-start" />
                Delete
              </Button>
            ) : null}
          </>
        }
      />

      {data.eligibility?.hasAgedOut ? (
        <MemberStatusBanner
          tone="warning"
          icon={AlertTriangleIcon}
          title={`Past the maximum age (${data.eligibility.age}, maximum ${data.eligibility.maximumAge})`}
          description="Under the organization's own rules this membership has ended. They are no longer billed for new periods. Their record is kept — decide whether to archive them, or record an exemption if the statutes allow one."
        />
      ) : null}

      {/*
        Above the approval banner on purpose: an admin who reads one line
        before clicking Approve should read this one. The server refuses the
        approval regardless until `acknowledgeUnderAge` is sent, so this is the
        explanation for the refusal rather than the control itself.
      */}
      {data.ageSignal?.isUnderAge ? (
        <MemberStatusBanner
          tone="danger"
          icon={AlertTriangleIcon}
          title={
            data.ageSignal.age == null
              ? "No date of birth on record"
              : `Under the minimum age (${data.ageSignal.age}, minimum ${data.ageSignal.minimumAge})`
          }
          description={
            data.ageSignal.age == null
              ? "Their age cannot be checked against the organization's minimum. Confirm the date of birth before approving."
              : "Approving requires confirming that a guardian has countersigned, or that the date of birth on record is wrong."
          }
        />
      ) : null}

      {member.status === "pending" ? (
        <MemberStatusBanner
          tone="warning"
          icon={AlertTriangleIcon}
          title="Awaiting approval"
          description={
            <>
              Nothing has been provisioned yet. Approving activates the
              membership
              {workspaceReady ? " and creates their Workspace account" : ""}.
            </>
          }
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={startApproval}
              disabled={approveAction.isPending}
            >
              {approveAction.isPending ? "Approving..." : "Approve"}
            </Button>
          }
        />
      ) : null}

      {data.paymentSummary.outstandingCents > 0 ? (
        <MemberStatusBanner
          tone="danger"
          icon={CircleAlertIcon}
          title={
            <>
              {formatFeeAmount(
                data.paymentSummary.outstandingCents,
                data.paymentSummary.currency ?? "CZK",
              )}{" "}
              unpaid
            </>
          }
          description={[
            data.paymentSummary.overdueCount > 0
              ? `${data.paymentSummary.overdueCount} payment${
                  data.paymentSummary.overdueCount === 1 ? " is" : "s are"
                } past due`
              : null,
            data.paymentSummary.nextDueAt
              ? `next due ${formatDate(data.paymentSummary.nextDueAt)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTabChange("payments")}
            >
              View payments
            </Button>
          }
        />
      ) : null}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">
            <UserRoundIcon data-icon="inline-start" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="payments">
            <WalletIcon data-icon="inline-start" />
            Payments
            <TabCount value={data.payments.length} />
          </TabsTrigger>
          <TabsTrigger value="groups">
            <UsersIcon data-icon="inline-start" />
            Groups
            <TabCount value={editor.metadata.groupAssignments.length} />
          </TabsTrigger>
          <TabsTrigger value="activity">
            <HistoryIcon data-icon="inline-start" />
            Activity
            <TabCount value={data.authEvents.length} />
          </TabsTrigger>
          <TabsTrigger value="emails">
            <MailIcon data-icon="inline-start" />
            Emails
            <TabCount value={data.emails.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <TabBody>
            {isEditing ? (
              <MemberProfileForm
                key={member.id}
                accessLevel={access.level}
                customFields={data.customFields}
                customFieldAnswers={editor.customFieldAnswers}
                customFieldErrors={updateAction.result.data?.customFieldErrors}
                isPending={updateAction.isPending}
                manageableGroupCategories={data.manageableGroupCategories}
                member={member}
                metadata={editor.metadata}
                roleOptions={access.roleOptions}
                serverError={updateAction.result.serverError}
                validationErrors={updateAction.result.validationErrors}
                onCancel={() => setIsEditing(false)}
                onSubmit={async (value) => {
                  await updateAction.executeAsync(value);
                }}
              />
            ) : (
              <MemberOverviewTab
                member={member}
                metadata={editor.metadata}
                customFields={data.customFields}
                workspaceEnabled={workspace.enabled}
                canCreateWorkspaceAccount={
                  workspaceReady && !member.workspaceUserId
                }
                onCreateWorkspaceAccount={() => {
                  setWorkspaceProvisionError(null);
                  setWorkspaceProvisionOpen(true);
                }}
              />
            )}
          </TabBody>
        </TabsContent>

        <TabsContent value="payments">
          <TabBody wide>
            <MemberPaymentsTab
              payments={data.payments}
              summary={data.paymentSummary}
              memberName={displayName}
            />
          </TabBody>
        </TabsContent>

        <TabsContent value="groups">
          <TabBody>
            <MemberGroupsTab
              assignments={editor.metadata.groupAssignments}
              workspaceGroupLinks={data.workspaceGroupLinks}
            />
          </TabBody>
        </TabsContent>

        <TabsContent value="activity">
          <TabBody wide>
            <MemberActivityTab
              timeline={editor.metadata.memberTimeline}
              authEvents={data.authEvents}
            />
          </TabBody>
        </TabsContent>

        <TabsContent value="emails">
          <TabBody wide>
            <MemberEmailsTab
              emails={data.emails}
              selectedEmail={data.selectedEmail}
              onOpenDetail={handleOpenEmail}
            />
          </TabBody>
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This soft-deletes the member immediately, hides them from the
              table, and schedules permanent removal after 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAction.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteAction.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteAction.execute({ memberId: member.id });
              }}
            >
              {deleteAction.isPending ? "Deleting..." : "Delete member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={rejectOpen}
        onOpenChange={(open) => {
          if (!open && !rejectAction.isPending) {
            setRejectOpen(false);
            setRejectReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <UserRoundXIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Reject {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              {member.email
                ? `This permanently deletes the application and every answer they gave. We will email ${member.email} to say it was not accepted. They can apply again later.`
                : "This permanently deletes the application and every answer they gave. The applicant has no email address, so no message will be sent."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="member-reject-reason">Reason (optional)</Label>
            <Textarea
              id="member-reject-reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              maxLength={600}
              rows={3}
              placeholder="We are at capacity for this season."
              disabled={rejectAction.isPending}
            />
            <p className="text-sm text-muted-foreground">
              {member.email
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
                rejectAction.execute({
                  memberId: member.id,
                  reason: rejectReason,
                });
              }}
            >
              {rejectAction.isPending ? "Rejecting..." : "Reject application"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={unconnectedWarningOpen}
        onOpenChange={setUnconnectedWarningOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Google Workspace is not connected</AlertDialogTitle>
            <AlertDialogDescription>
              The Workspace module is enabled, but the Google connection was
              never completed — so approving {displayName} will activate their
              membership without creating a Google account. You can connect
              Workspace first and approve afterwards, or approve now and
              provision the account later.
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
                approveAction.execute({
                  memberId: member.id,
                  role: member.role,
                  acknowledgeWorkspaceUnavailable: true,
                  acknowledgeUnderAge: underAgeConfirmed,
                });
                setUnconnectedWarningOpen(false);
              }}
            >
              <UserRoundCheckIcon data-icon="inline-start" />
              Approve without account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={underAgeWarningOpen}
        onOpenChange={setUnderAgeWarningOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {data.ageSignal?.age == null
                ? "No date of birth on record"
                : `${displayName} is under the minimum age`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {data.ageSignal?.age == null ? (
                <>
                  Their age cannot be checked against the organization&apos;s
                  minimum of {data.ageSignal?.minimumAge}. Confirm the date of
                  birth on their profile, or approve only if you have verified it
                  another way.
                </>
              ) : (
                <>
                  They are {data.ageSignal.age}, and the organization&apos;s
                  minimum is {data.ageSignal.minimumAge}. Approve only with a
                  guardian&apos;s countersignature on file, or if the date of
                  birth on record is wrong. Record the countersignature against
                  the membership rules so the decision stays traceable.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setUnderAgeConfirmed(true);
                setUnderAgeWarningOpen(false);
                // Passed explicitly rather than read back from state, which has
                // not re-rendered yet at this point.
                proceedWithApproval(true);
              }}
            >
              <UserRoundCheckIcon data-icon="inline-start" />
              Approve anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MemberApproveWorkspaceDialog
        open={workspaceApproveOpen}
        onOpenChange={(open) => {
          setWorkspaceApproveOpen(open);
          if (!open) {
            setWorkspaceApproveError(null);
          }
        }}
        member={workspaceApproveOpen ? approvalMember : null}
        workspaceDomain={workspace.domain ?? ""}
        defaultPhoneCountry={workspace.countryCode}
        isPending={approveAction.isPending}
        submitError={workspaceApproveError}
        provisionFields={workspaceProvisionFields}
        onSkip={() => {
          setWorkspaceApproveError(null);
          approveAction.execute({
            memberId: member.id,
            role: member.role,
            skipWorkspaceAccount: true,
            acknowledgeUnderAge: underAgeConfirmed,
          });
        }}
        onConfirm={async ({ primaryEmail, extraFields }) => {
          setWorkspaceApproveError(null);
          await approveAction.executeAsync({
            memberId: member.id,
            role: member.role,
            workspace: { primaryEmail, extraFields },
            acknowledgeUnderAge: underAgeConfirmed,
          });
        }}
      />

      <MemberApproveWorkspaceDialog
        mode="provision"
        open={workspaceProvisionOpen}
        onOpenChange={(open) => {
          setWorkspaceProvisionOpen(open);
          if (!open) {
            setWorkspaceProvisionError(null);
          }
        }}
        member={workspaceProvisionOpen ? approvalMember : null}
        workspaceDomain={workspace.domain ?? ""}
        defaultPhoneCountry={workspace.countryCode}
        isPending={provisionAction.isPending}
        submitError={workspaceProvisionError}
        provisionFields={workspaceProvisionFields}
        onConfirm={async ({ primaryEmail, extraFields }) => {
          setWorkspaceProvisionError(null);
          await provisionAction.executeAsync({
            memberId: member.id,
            primaryEmail,
            extraFields,
          });
        }}
      />
    </div>
  );
}
