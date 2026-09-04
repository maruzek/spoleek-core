"use client";

import { useEffect, useState } from "react";
import { AlertCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AvailabilityBadge,
  ProvisionFieldInput,
  WORKSPACE_EMAIL_PATTERN,
  isEmptyValue,
  useProvisionFieldState,
  useWorkspaceEmailAvailability,
  type EnabledProvisionField,
} from "@/components/app/workspace-account-fields";
import {
  getProvisionFieldDefaultsAction,
  suggestWorkspaceEmailAction,
} from "@/server/actions/member-admin";
import { normalizeWorkspaceFieldValues } from "@/server/lib/workspace/field-catalog";
import type { WorkspaceFieldValues } from "@/server/lib/workspace/field-catalog";

export type { EnabledProvisionField };

export type WorkspaceApprovalMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: "member" | "leader" | "org_admin";
};

/**
 * "approve" also flips the membership to active; "provision" only creates the
 * Google account for a member who already exists. Same inputs either way, so
 * only the wording and the confirm handler differ.
 */
export type WorkspaceDialogMode = "approve" | "provision";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: WorkspaceApprovalMember | null;
  workspaceDomain: string;
  isPending: boolean;
  submitError: string | null;
  provisionFields: EnabledProvisionField[];
  mode?: WorkspaceDialogMode;
  /** Org country (ISO-3166 alpha-2) used to complete local phone numbers. */
  defaultPhoneCountry?: string;
  /**
   * Approve (or close) without creating any Google account. Omitted when
   * skipping makes no sense for the caller.
   */
  onSkip?: () => void;
  onConfirm: (input: {
    primaryEmail: string;
    extraFields: WorkspaceFieldValues;
  }) => Promise<void>;
};

export function MemberApproveWorkspaceDialog(props: DialogProps) {
  const { open, onOpenChange, member } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {member ? (
          <DialogBody
            key={`${member.id}:${open ? "open" : "closed"}`}
            {...props}
            member={member}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DialogBody({
  onOpenChange,
  member,
  workspaceDomain,
  isPending,
  submitError,
  provisionFields,
  mode = "approve",
  defaultPhoneCountry,
  onSkip,
  onConfirm,
}: Omit<DialogProps, "open" | "member"> & {
  member: WorkspaceApprovalMember;
}) {
  const [email, setEmail] = useState("");
  const [extraFields, setExtraFields] = useState<WorkspaceFieldValues>({});
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [emailResult, defaultsResult] = await Promise.all([
        suggestWorkspaceEmailAction({ memberId: member.id }),
        getProvisionFieldDefaultsAction({ memberId: member.id }),
      ]);
      if (cancelled) return;
      setEmail(emailResult?.data?.suggestion ?? "");
      if (defaultsResult?.data?.defaults) {
        // Member data is not stored in E.164; normalize before it is shown so
        // the admin reviews the value that will actually be sent.
        const defaults = normalizeWorkspaceFieldValues(
          defaultsResult.data.defaults,
          defaultPhoneCountry,
        );
        setExtraFields((prev) => ({ ...defaults, ...prev }));
      }
      setDefaultsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [member.id, defaultPhoneCountry]);

  const availability = useWorkspaceEmailAvailability({
    email,
    memberId: member.id,
  });
  const { fieldErrors, requiredFieldsMissing } = useProvisionFieldState(
    provisionFields,
    extraFields,
  );
  const emailIsValid = WORKSPACE_EMAIL_PATTERN.test(email.trim());

  const canSubmit =
    !isPending &&
    emailIsValid &&
    !requiredFieldsMissing &&
    Object.keys(fieldErrors).length === 0 &&
    (availability.status === "available" || availability.status === "idle");

  const memberName =
    [member.firstName, member.lastName].filter(Boolean).join(" ") ||
    member.email ||
    "this member";
  const isApproval = mode === "approve";

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isApproval
            ? "Approve and create Workspace account"
            : "Create Workspace account"}
        </DialogTitle>
        <DialogDescription>
          {isApproval ? (
            <>
              Approving {memberName} will create a Google Workspace account on{" "}
              <span className="font-medium">{workspaceDomain}</span> and email
              them sign-in instructions.
            </>
          ) : (
            <>
              This creates a Google Workspace account for {memberName} on{" "}
              <span className="font-medium">{workspaceDomain}</span> and emails
              them sign-in instructions. Their membership status is unchanged.
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-5 py-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="workspace-email">Workspace email</Label>
          <Input
            id="workspace-email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={`name@${workspaceDomain}`}
          />
          <AvailabilityBadge state={availability} />
        </div>

        {provisionFields.length > 0 ? (
          <div className="flex flex-col gap-3">
            {provisionFields.map((field) => (
              <ProvisionFieldInput
                key={field.fieldKey}
                field={field}
                value={extraFields[field.fieldKey]}
                error={fieldErrors[field.fieldKey]}
                sourceEmpty={
                  defaultsLoaded && isEmptyValue(extraFields[field.fieldKey])
                }
                defaultPhoneCountry={defaultPhoneCountry}
                onChange={(val) =>
                  setExtraFields((prev) => ({
                    ...prev,
                    [field.fieldKey]: val,
                  }))
                }
              />
            ))}
          </div>
        ) : null}

        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          A temporary password will be generated and sent to{" "}
          <span className="font-medium text-foreground">
            {member.email ?? "the member's personal email"}
          </span>
          . Google will prompt them to choose a new password on first sign-in.
        </div>

        {submitError ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Could not provision account</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isPending}
        >
          Cancel
        </Button>
        {onSkip ? (
          <Button
            type="button"
            variant="secondary"
            onClick={onSkip}
            disabled={isPending}
          >
            {isApproval ? "Approve without account" : "Skip for now"}
          </Button>
        ) : null}
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() =>
            onConfirm({
              primaryEmail: email.trim().toLowerCase(),
              extraFields: normalizeWorkspaceFieldValues(
                extraFields,
                defaultPhoneCountry,
              ),
            })
          }
        >
          {isPending
            ? "Creating account..."
            : isApproval
              ? "Approve & create account"
              : "Create account"}
        </Button>
      </DialogFooter>
    </>
  );
}
