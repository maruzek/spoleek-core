"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon, FileTextIcon, GlobeIcon, UsersIcon } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JoinPageSettingsForm } from "@/components/app/join-page-settings-form";
import {
  EmailNotificationSettingsCard,
  type EmailNotificationSettingsState,
} from "@/components/app/email-notification-settings-card";
import {
  MembershipSettingsCard,
  type MembershipSettingsState,
} from "@/components/app/membership-settings-card";
import {
  WorkspaceSettingsCard,
  type WorkspaceSettingsState,
} from "@/components/app/workspace-settings-card";
import type { Organization, OrganizationPolicy } from "@/server/db/schema";

type AdminSettingsTabsProps = {
  organization: Pick<Organization, "joinPageHeadline" | "joinPageBody">;
  policy: Pick<
    OrganizationPolicy,
    | "memberInviteEmailSubject"
    | "memberInviteEmailBody"
    | "termsOfServiceLabel"
    | "termsOfServiceText"
    | "privacyPolicyLabel"
    | "privacyPolicyText"
  >;
  membershipState: MembershipSettingsState;
  emailNotificationState: EmailNotificationSettingsState;
  workspaceState: WorkspaceSettingsState;
  defaultTab?: string;
};

const VALID_TABS = ["join", "membership", "notifications", "workspace"] as const;
type TabValue = (typeof VALID_TABS)[number];

function toValidTab(tab: string | undefined): TabValue {
  return VALID_TABS.includes(tab as TabValue) ? (tab as TabValue) : "join";
}

export function AdminSettingsTabs({
  organization,
  policy,
  membershipState,
  emailNotificationState,
  workspaceState,
  defaultTab,
}: AdminSettingsTabsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabValue>(toValidTab(defaultTab));

  function handleTabChange(value: string) {
    const tab = toValidTab(value);
    setActiveTab(tab);
    router.replace(`/admin/settings?tab=${tab}`, { scroll: false });
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="join">
          <FileTextIcon data-icon="inline-start" />
          Join page
        </TabsTrigger>
        <TabsTrigger value="membership">
          <UsersIcon data-icon="inline-start" />
          Membership
        </TabsTrigger>
        <TabsTrigger value="notifications">
          <BellIcon data-icon="inline-start" />
          Notifications
        </TabsTrigger>
        <TabsTrigger value="workspace">
          <GlobeIcon data-icon="inline-start" />
          Workspace
        </TabsTrigger>
      </TabsList>

      <TabsContent value="join">
        <div className="max-w-2xl pt-6">
          <JoinPageSettingsForm organization={organization} policy={policy} />
        </div>
      </TabsContent>

      <TabsContent value="membership">
        <div className="max-w-2xl pt-6">
          <MembershipSettingsCard state={membershipState} />
        </div>
      </TabsContent>

      <TabsContent value="notifications">
        <div className="max-w-2xl pt-6">
          <EmailNotificationSettingsCard state={emailNotificationState} />
        </div>
      </TabsContent>

      <TabsContent value="workspace">
        <div className="max-w-2xl pt-6">
          <WorkspaceSettingsCard state={workspaceState} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
