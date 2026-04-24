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
  disconnectWorkspaceAction,
  saveWorkspaceSettingsAction,
  setWorkspaceOrgUnitCategoryAction,
} from "@/server/actions/organization-settings";
import { renderWorkspaceEmailLocalPart } from "@/server/lib/workspace/email-template";
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
  const [orgUnitCategoryId, setOrgUnitCategoryId] = useState<string>(
    state.workspaceOrgUnitCategoryId ?? "",
  );
  const [isConnecting, startConnecting] = useTransition();

  const saveAction = useAction(saveWorkspaceSettingsAction, {
    onSuccess() {
      toast.success("Workspace settings saved.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save settings.");
    },
  });
  const orgUnitCategoryAction = useAction(setWorkspaceOrgUnitCategoryAction, {
    onSuccess() {
      toast.success("Org unit category saved.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save org unit category.");
    },
  });
  const disconnectAction = useAction(disconnectWorkspaceAction, {
    onSuccess() {
      toast.success("Workspace disconnected.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not disconnect Workspace.");
    },
  });

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
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[240px] flex-1 flex-col gap-2">
              <Select
                value={orgUnitCategoryId}
                onValueChange={setOrgUnitCategoryId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None — disable org unit sync" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem>None</SelectItem>
                  {state.groupCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {orgUnitCategoryId ? (
                <p className="text-xs text-muted-foreground">
                  Saving will enforce single selection, required, and admin-only
                  join on this category.
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                orgUnitCategoryAction.execute({
                  categoryId: orgUnitCategoryId || null,
                })
              }
              disabled={orgUnitCategoryAction.isPending}
            >
              {orgUnitCategoryAction.isPending
                ? "Saving…"
                : "Save org unit category"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() =>
            saveAction.execute({
              moduleEnabled,
              workspaceDomain: domain.trim() || null,
              emailTemplate: template.trim() || null,
              defaultEmailPreference,
            })
          }
          disabled={saveAction.isPending || (moduleEnabled && !canEnable)}
        >
          {saveAction.isPending ? "Saving…" : "Save settings"}
        </Button>

        {state.connected ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => disconnectAction.execute({})}
            disabled={disconnectAction.isPending}
          >
            <UnlinkIcon data-icon="inline-start" />
            {disconnectAction.isPending ? "Disconnecting…" : "Disconnect"}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
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
        )}
      </div>

      {state.connected ? (
        <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Connected as{" "}
          <span className="font-medium text-foreground">
            {state.adminEmail ?? "a super-admin"}
          </span>
          {state.connectedAt ? (
            <>
              {" "}
              since{" "}
              <span className="font-medium text-foreground">
                {new Date(state.connectedAt).toLocaleDateString()}
              </span>
            </>
          ) : null}
          .
        </div>
      ) : moduleEnabled ? (
        <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Connect as a Google Workspace super-admin. Spoleek needs the{" "}
          <code>admin.directory.user</code> scope so it can create new user
          accounts on your domain.
        </div>
      ) : null}
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
