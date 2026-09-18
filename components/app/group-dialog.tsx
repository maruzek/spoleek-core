"use client";

import { PencilIcon, UsersIcon } from "lucide-react";

import { FormDialog } from "@/components/app/form-dialog";
import { GroupForm, type GroupValidationErrors } from "@/components/app/group-form";
import type { GroupFormValues } from "@/lib/groups";

const FORM_ID = "group-form";

export function GroupDialog({
  open,
  categoryId,
  group,
  isPending,
  validationErrors,
  categoryManagesFees,
  categoryGroupPagesVisibleToAllMembers,
  workspaceConnected,
  canManageWorkspaceIntegration,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  categoryId: string;
  group?: Partial<GroupFormValues> | null;
  isPending: boolean;
  validationErrors?: GroupValidationErrors;
  categoryManagesFees?: boolean;
  categoryGroupPagesVisibleToAllMembers?: boolean;
  workspaceConnected?: boolean;
  canManageWorkspaceIntegration?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: GroupFormValues) => Promise<void>;
}) {
  const editing = Boolean(group?.id);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={editing ? <PencilIcon /> : <UsersIcon />}
      title={editing ? `Edit ${group?.name ?? "group"}` : "New group"}
      description={
        editing ? undefined : "Members are assigned to this group; its join policy decides who can move them."
      }
      formId={FORM_ID}
      isPending={isPending}
      submitLabel={editing ? "Save group" : "Create group"}
    >
      <GroupForm
        key={group?.id ?? "new"}
        id={FORM_ID}
        hideFooter
        categoryId={categoryId}
        group={group}
        isPending={isPending}
        validationErrors={validationErrors}
        categoryManagesFees={categoryManagesFees}
        categoryGroupPagesVisibleToAllMembers={categoryGroupPagesVisibleToAllMembers}
        workspaceConnected={workspaceConnected}
        canManageWorkspaceIntegration={canManageWorkspaceIntegration}
        onSubmit={onSubmit}
      />
    </FormDialog>
  );
}
