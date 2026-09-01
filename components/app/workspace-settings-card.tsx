"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  LinkIcon,
  Loader2Icon,
  UnlinkIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  WorkspaceProvisionFields,
  toProvisionFieldState,
} from "@/components/app/workspace-provision-fields";
import {
  disconnectWorkspaceAction,
  saveWorkspaceProvisionFieldsAction,
  saveWorkspaceSettingsAction,
  setWorkspaceOrgUnitCategoryAction,
} from "@/server/actions/organization-settings";
import { formatDate } from "@/lib/format";
import { renderWorkspaceEmailLocalPart } from "@/server/lib/workspace/email-template";
import type { WorkspaceProvisionFieldConfig } from "@/server/lib/workspace/field-catalog";
import type { MemberPreferredEmail } from "@/server/db/schema";

export type WorkspaceSettingsState = {
  moduleEnabled: boolean;
  connected: boolean;
  domain: string | null;
  emailTemplate: string;
  adminEmail: string | null;
  connectedAt: string | null;
  defaultEmailPreference: MemberPreferredEmail;
  groupCategories: { id: string; name: string }[];
  workspaceOrgUnitCategoryId: string | null;
  provisionFields: WorkspaceProvisionFieldConfig[];
  customFields: { key: string; label: string }[];
};

export function WorkspaceSettingsCard({
  state,
}: {
  state: WorkspaceSettingsState;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceStatus = searchParams.get("workspace");
  const workspaceMessage = searchParams.get("workspaceMessage");

  const [moduleEnabled, setModuleEnabled] = useState(state.moduleEnabled);
  const [domain, setDomain] = useState(state.domain ?? "");
  const [template, setTemplate] = useState(
    state.emailTemplate || "{first}.{last}",
  );
  const [defaultEmailPreference, setDefaultEmailPreference] =
    useState<MemberPreferredEmail>(state.defaultEmailPreference);
  const NONE_SENTINEL = "__none__";
  const [orgUnitCategoryId, setOrgUnitCategoryId] = useState<string>(
    state.workspaceOrgUnitCategoryId ?? NONE_SENTINEL,
  );
  const [isConnecting, startConnecting] = useTransition();

  const saveAction = useAction(saveWorkspaceSettingsAction);
  const orgUnitCategoryAction = useAction(setWorkspaceOrgUnitCategoryAction);
  const disconnectAction = useAction(disconnectWorkspaceAction, {
    onSuccess() {
      toast.success("Workspace disconnected.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not disconnect Workspace.");
    },
  });

  const [provisionFields, setProvisionFields] = useState<
    WorkspaceProvisionFieldConfig[]
  >(() => toProvisionFieldState(state.provisionFields));
  const provisionFieldsAction = useAction(saveWorkspaceProvisionFieldsAction);

  const [isSaving, startSaving] = useTransition();

  const handleSaveAll = () => {
    startSaving(async () => {
      const results = await Promise.all([
        saveAction.executeAsync({
          moduleEnabled,
          workspaceDomain: domain.trim() || null,
          emailTemplate: template.trim() || null,
          defaultEmailPreference,
        }),
        ...(state.connected
          ? [
              orgUnitCategoryAction.executeAsync({
                categoryId:
                  orgUnitCategoryId === NONE_SENTINEL ? null : orgUnitCategoryId,
              }),
              provisionFieldsAction.executeAsync({
                fields: provisionFields.filter((f) => f.enabled),
              }),
            ]
          : []),
      ]);

      const firstError = results.find((r) => r?.serverError)?.serverError;
      if (firstError) {
        toast.error(firstError);
        return;
      }

      toast.success("Workspace settings saved.");
      router.refresh();
    });
  };

  const localPreview = useMemo(
    () =>
      renderWorkspaceEmailLocalPart({
        template: template || "{first}.{last}",
        firstName: "Jane",
        lastName: "Doe",
      }),
    [template],
  );

  const canEnable = domain.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      {workspaceStatus === "ok" ? (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>Google Workspace connected</AlertTitle>
          <AlertDescription>
            You can now approve members and provision Workspace accounts.
          </AlertDescription>
        </Alert>
      ) : null}
      {workspaceStatus === "error" ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Connection failed</AlertTitle>
          <AlertDescription>{decodeMessage(workspaceMessage)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            Workspace module
          </span>
          <span className="text-xs text-muted-foreground">
            Replace email/password activation with Workspace account creation.
          </span>
        </div>
        <Switch
          checked={moduleEnabled}
          onCheckedChange={setModuleEnabled}
          aria-label="Enable Workspace module"
        />
      </div>

      {state.connected ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 px-4 py-3">
          <div className="text-sm text-muted-foreground">
            Connected as{" "}
            <span className="font-medium text-foreground">
              {state.adminEmail ?? "a super-admin"}
            </span>
            {state.connectedAt ? (
              <>
                {" "}
                since{" "}
                <span className="font-medium text-foreground">
                  {formatDate(state.connectedAt)}
                </span>
              </>
            ) : null}
            .
          </div>
          <p className="text-xs text-muted-foreground">
            Disconnecting stops new Workspace account creation and org unit
            syncing. Existing Workspace accounts and members keep working, but
            you&apos;ll need to reconnect before approving members or managing
            accounts here again.
          </p>
          <Button
            type="button"
            variant="destructive"
            className="self-start"
            onClick={() => disconnectAction.execute({})}
            disabled={disconnectAction.isPending}
          >
            <UnlinkIcon data-icon="inline-start" />
            {disconnectAction.isPending ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Connect as a Google Workspace super-admin. Spoleek needs the{" "}
            <code>admin.directory.user</code> scope so it can create new user
            accounts on your domain.
          </p>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={!moduleEnabled || !canEnable || isConnecting}
            onClick={() => {
              startConnecting(() => {
                window.location.href = "/api/workspace/oauth/start";
              });
            }}
          >
            {isConnecting ? (
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
            ) : (
              <LinkIcon data-icon="inline-start" />
            )}
            Connect Google Workspace
            <ExternalLinkIcon data-icon="inline-end" />
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="workspace-domain">Workspace domain</Label>
          <Input
            id="workspace-domain"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="spoleek.org"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            The domain of your Google Workspace (e.g. <code>spoleek.org</code>).
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="workspace-template">Email template</Label>
          <Input
            id="workspace-template"
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
            placeholder="{first}.{last}"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            Preview for Jane Doe:{" "}
            <span className="font-mono text-foreground">
              {localPreview}
              {domain ? `@${domain.trim().toLowerCase()}` : ""}
            </span>
          </p>
        </div>
      </div>

      {moduleEnabled ? (
        <div className="flex flex-col gap-2">
          <Label>Default preferred email</Label>
          <RadioGroup
            value={defaultEmailPreference}
            onValueChange={(v) =>
              setDefaultEmailPreference(v as MemberPreferredEmail)
            }
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="personal" id="pref-personal" />
              <Label
                htmlFor="pref-personal"
                className="cursor-pointer font-normal"
              >
                Personal email
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem
                value="workspace"
                id="pref-workspace"
                disabled={!state.connected}
              />
              <Label
                htmlFor="pref-workspace"
                className="cursor-pointer font-normal"
              >
                Workspace email
                {!state.connected ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (connect first)
                  </span>
                ) : null}
              </Label>
            </div>
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            Members who have not set a personal preference will use this
            default.
          </p>
        </div>
      ) : null}

      {state.connected ? (
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex flex-col gap-1">
            <Label>Org unit category</Label>
            <p className="text-xs text-muted-foreground">
              Members must belong to exactly one group in this category. When
              assigned, their Workspace account is moved to that group&apos;s
              org unit path.
            </p>
          </div>
          <div className="flex min-w-[240px] flex-col gap-2">
            <Select
              value={orgUnitCategoryId}
              onValueChange={setOrgUnitCategoryId}
            >
              <SelectTrigger>
                <SelectValue placeholder="None — disable org unit sync" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_SENTINEL}>None</SelectItem>
                {state.groupCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {orgUnitCategoryId !== NONE_SENTINEL ? (
              <p className="text-xs text-muted-foreground">
                Saving will enforce single selection, required, and admin-only
                join on this category.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.connected ? (
        <WorkspaceProvisionFields
          fields={provisionFields}
          onFieldsChange={setProvisionFields}
          customFields={state.customFields}
          groupCategories={state.groupCategories}
        />
      ) : null}

      <div className="border-t pt-4">
        <Button
          type="button"
          onClick={handleSaveAll}
          disabled={isSaving || (moduleEnabled && !canEnable)}
        >
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function decodeMessage(value: string | null) {
  if (!value) return "Google did not return a reason.";
  switch (value) {
    case "invalid_state":
      return "The OAuth state could not be verified. Try again from Settings.";
    case "no_refresh_token":
      return "Google did not return a refresh token. Revoke access in your Google account and retry.";
    case "domain_mismatch":
      return "The signing-in Google account does not belong to the configured workspace domain.";
    case "domain_missing":
      return "Set the Workspace domain before connecting.";
    case "access_denied":
      return "You cancelled the Google consent screen.";
    default:
      return value;
  }
}
