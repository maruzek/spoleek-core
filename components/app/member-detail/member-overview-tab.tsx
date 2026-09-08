"use client";

import { useMemo } from "react";
import { useFormatters } from "@/components/locale-provider";
import {
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  LockIcon,
  RefreshCwIcon,
  UserRoundPlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAction } from "next-safe-action/hooks";
import { useRouter } from "next/navigation";

import { useAppShell } from "@/components/app/app-shell-provider";
import {
  DefinitionList,
  DefinitionRow,
  DetailSection,
} from "@/components/app/definition-list";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/code-block/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { describeMemberInvite } from "@/lib/member-invite-summary";
import { cn } from "@/lib/utils";
import { syncWorkspaceMemberAction } from "@/server/actions/member-admin";
import type { MemberCustomField, TenantMember } from "@/server/db/schema";
import type {
  MemberCustomFieldDisplay,
  MemberEditorMetadata,
} from "@/server/queries/members";

type OverviewMember = Omit<TenantMember, "status"> & {
  status: Exclude<TenantMember["status"], "deleted">;
};

export function MemberOverviewTab({
  member,
  metadata,
  customFields,
  workspaceEnabled,
  canCreateWorkspaceAccount = false,
  onCreateWorkspaceAccount,
}: {
  member: OverviewMember;
  metadata: MemberEditorMetadata;
  customFields: MemberCustomField[];
  workspaceEnabled: boolean;
  /** Workspace is connected and this member has no account yet. */
  canCreateWorkspaceAccount?: boolean;
  onCreateWorkspaceAccount?: () => void;
}) {
  const { formatDateTime } = useFormatters();
  const policyAcknowledgements = metadata.policyAcknowledgements;

  const router = useRouter();
  const { organization } = useAppShell();
  const invite = describeMemberInvite(member, metadata.inviteState);
  const effectivePreferredEmail =
    member.preferredEmail ?? organization.defaultEmailPreference;

  /** Every answer the org can see, in field order. Only "hidden" is withheld. */
  const visibleCustomFields = useMemo<MemberCustomFieldDisplay[]>(() => {
    const discoveryByKey = new Map(
      customFields.map((field) => [field.key, field.discoveryMode]),
    );

    return metadata.customFieldDetails.filter(
      (detail) => discoveryByKey.get(detail.key) !== "hidden",
    );
  }, [customFields, metadata.customFieldDetails]);

  const withheldCustomFields = metadata.withheldCustomFields;

  const syncAction = useAction(syncWorkspaceMemberAction, {
    onExecute: () => {
      toast.loading("Syncing Workspace identity...", { id: "sync-workspace" });
    },
    onSuccess: () => {
      toast.success("Workspace identity linked successfully.", {
        id: "sync-workspace",
      });
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError || "Failed to sync Workspace identity.", {
        id: "sync-workspace",
      });
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <DetailSection
        title="Contact"
        description="How this organization reaches the member."
      >
        <DefinitionList>
          <DefinitionRow
            label="Personal email"
            value={member.email ?? "Not set"}
            action={
              member.email ? (
                <CopyButton
                  content={member.email}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Copy personal email"
                />
              ) : null
            }
          />
          {workspaceEnabled ? (
            <DefinitionRow
              label="Workspace email"
              value={member.workspaceUserEmail ?? "Not linked"}
              description={
                member.workspaceProvisionedAt
                  ? `Provisioned ${formatDateTime(member.workspaceProvisionedAt)}`
                  : canCreateWorkspaceAccount
                    ? "No Google account yet. Create one whenever you are ready."
                    : undefined
              }
              action={
                <div className="flex items-center gap-1">
                  {member.workspaceUserEmail ? (
                    <CopyButton
                      content={member.workspaceUserEmail}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Copy workspace email"
                    />
                  ) : null}
                  {canCreateWorkspaceAccount && onCreateWorkspaceAccount ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onCreateWorkspaceAccount}
                    >
                      <UserRoundPlusIcon data-icon="inline-start" />
                      Create account
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Workspace identity actions"
                      >
                        <EllipsisVerticalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                      {member.workspaceUserId ? (
                        <DropdownMenuItem asChild>
                          <a
                            href={`https://admin.google.com/ac/users/${member.workspaceUserId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLinkIcon />
                            Admin Console
                          </a>
                        </DropdownMenuItem>
                      ) : null}
                      {canCreateWorkspaceAccount && onCreateWorkspaceAccount ? (
                        <DropdownMenuItem onClick={onCreateWorkspaceAccount}>
                          <UserRoundPlusIcon />
                          Create account
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        onClick={() =>
                          syncAction.execute({ memberId: member.id })
                        }
                        disabled={syncAction.isPending}
                      >
                        <RefreshCwIcon
                          className={cn(syncAction.isPending && "animate-spin")}
                        />
                        Sync identity
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              }
            />
          ) : null}
          <DefinitionRow
            label="Preferred"
            value={
              effectivePreferredEmail === "workspace"
                ? "Workspace email"
                : "Personal email"
            }
            description={
              member.preferredEmail
                ? "Set on this member."
                : "Inherited from the organization default."
            }
          />
        </DefinitionList>
      </DetailSection>

      {visibleCustomFields.length > 0 || withheldCustomFields.length > 0 ? (
        <>
          <Separator />
          <DetailSection
            title="Custom fields"
            description="Answers to the fields this organization defined."
          >
            <DefinitionList>
              {visibleCustomFields.map((field) => (
                <DefinitionRow
                  key={field.key}
                  label={field.label}
                  value={field.displayValue || "—"}
                />
              ))}
              {/*
                Listed rather than dropped. A field you cannot read and a field
                nobody answered must not look the same — that is how somebody
                concludes no allergy was declared.
              */}
              {withheldCustomFields.map((field) => (
                <DefinitionRow
                  key={field.key}
                  label={field.label}
                  value={
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <LockIcon className="size-3.5" aria-hidden />
                      {field.hasWithheldAnswer ? "Answer recorded" : "No answer"}
                    </span>
                  }
                  description="Visible to org admins only. Ask an org admin if you need it."
                />
              ))}
            </DefinitionList>
          </DetailSection>
        </>
      ) : null}

      <Separator />

      <DetailSection
        title="Membership"
        description="Account state, invite health, and recorded consent."
      >
        <DefinitionList>
          <DefinitionRow
            label="Account"
            value={member.userId ? "Linked account" : "Shadow profile"}
            description={
              metadata.linkedUserName ?? "No linked user name recorded."
            }
          />
          <DefinitionRow
            label="Linked at"
            value={member.linkedAt ? formatDateTime(member.linkedAt) : "Never"}
          />
          <DefinitionRow
            label="Invite"
            value={<span className="capitalize">{invite.value}</span>}
            description={invite.description}
          />
          {policyAcknowledgements.length === 0 ? (
            <DefinitionRow
              label="Legal documents"
              value="Never shown"
              // "Never shown" rather than "not accepted": this is the normal
              // state for an imported or admin-created member, and reporting it
              // as a refusal would misdescribe what happened.
              description="This member has not been presented with any document yet. The portal asks them on their next visit."
            />
          ) : (
            policyAcknowledgements.map((acknowledgement) => (
              <DefinitionRow
                key={acknowledgement.versionId}
                label={acknowledgement.documentTitle}
                value={formatDateTime(acknowledgement.acknowledgedAt)}
                description={`Version ${acknowledgement.version ?? "—"}${
                  acknowledgement.method === "admin_recorded"
                    ? " · recorded by an administrator"
                    : acknowledgement.method === "registration"
                      ? " · at registration"
                      : ""
                }`}
              />
            ))
          )}
        </DefinitionList>
      </DetailSection>
    </div>
  );
}
