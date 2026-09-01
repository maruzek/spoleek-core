"use client";

import type { GroupFormValues } from "@/lib/groups";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { GroupForm, type GroupValidationErrors } from "@/components/app/group-form";

export function GroupSheet({
  open,
  categoryId,
  group,
  isPending,
  validationErrors,
  categoryManagesFees,
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
  workspaceConnected?: boolean;
  canManageWorkspaceIntegration?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: GroupFormValues) => Promise<void>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{group?.id ? "Edit group" : "Create group"}</SheetTitle>
          <SheetDescription>
            Configure the active unit inside this category, including its join policy and
            operational status.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <GroupForm
            key={group?.id ?? "new"}
            categoryId={categoryId}
            group={group}
            isPending={isPending}
            validationErrors={validationErrors}
            categoryManagesFees={categoryManagesFees}
            workspaceConnected={workspaceConnected}
            canManageWorkspaceIntegration={canManageWorkspaceIntegration}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
