"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BellIcon,
  CalendarIcon,
  FileTextIcon,
  GlobeIcon,
  LanguagesIcon,
  Link2Icon,
  ScaleIcon,
  UsersIcon,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JoinPageSettingsForm } from "@/components/app/join-page-settings-form";
import {
  EventsSettingsCard,
  type EventSettingsState,
} from "@/components/app/events-settings-card";
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
import {
  LocalizationSettingsCard,
  type LocalizationSettingsState,
} from "@/components/app/localization-settings-card";
import { GroupLinksSettingsCard } from "@/components/app/group-links-settings-card";
import { LegalSettingsCard } from "@/components/app/legal-settings-card";
import type { GroupWorkspaceLinkRow } from "@/server/queries/workspace-group-links";
import type { PolicyDocumentRow } from "@/server/queries/policies";
import type { Organization, OrganizationPolicy } from "@/server/db/schema";

type AdminSettingsTabsProps = {
  organization: Pick<
    Organization,
    | "joinPageHeadline"
    | "joinPageBody"
    | "registrationMinimumAge"
    | "membershipEndsAtAge"
    | "maximumAgeEffect"
  >;
  policy: Pick<
    OrganizationPolicy,
    "memberInviteEmailSubject" | "memberInviteEmailBody"
  >;
  policyDocuments: PolicyDocumentRow[];
  membershipState: MembershipSettingsState;
  membershipLocale: string;
  feeManagingCategoryName: string | null;
  localizationState: LocalizationSettingsState;
  emailNotificationState: EmailNotificationSettingsState;
  eventSettingsState: EventSettingsState;
  workspaceState: WorkspaceSettingsState;
  workspaceLinks: GroupWorkspaceLinkRow[];
  defaultTab?: string;
};

const VALID_TABS = [
  "join",
  "legal",
  "membership",
  "notifications",
  "events",
  "groups",
  "workspace",
  "localization",
] as const;
type TabValue = (typeof VALID_TABS)[number];

function toValidTab(tab: string | undefined): TabValue {
  return VALID_TABS.includes(tab as TabValue) ? (tab as TabValue) : "join";
}

export function AdminSettingsTabs({
  organization,
  policy,
  policyDocuments,
  membershipState,
  membershipLocale,
  feeManagingCategoryName,
  localizationState,
  emailNotificationState,
  eventSettingsState,
  workspaceState,
  workspaceLinks,
  defaultTab,
}: AdminSettingsTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The URL owns the active tab: the ⌘K palette (and any deep link) switches
  // tabs by changing `?tab=`, which must work while already on this page.
  const activeTab = toValidTab(searchParams.get("tab") ?? defaultTab);

  function handleTabChange(value: string) {
    const tab = toValidTab(value);
    router.replace(`/admin/settings?tab=${tab}`, { scroll: false });
  }

  // `#anchor` names one setting inside the tab (see SETTINGS_INDEX in
  // lib/command-palette.ts). Scroll it into view once the tab has rendered;
  // a control hidden behind a switch simply is not there, and the tab is the
  // landing spot.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(hash);
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, searchParams]);

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="join">
          <FileTextIcon data-icon="inline-start" />
          Join page
        </TabsTrigger>
        <TabsTrigger value="legal">
          <ScaleIcon data-icon="inline-start" />
          Legal
        </TabsTrigger>
        <TabsTrigger value="membership">
          <UsersIcon data-icon="inline-start" />
          Membership
        </TabsTrigger>
        <TabsTrigger value="notifications">
          <BellIcon data-icon="inline-start" />
          Notifications
        </TabsTrigger>
        <TabsTrigger value="events">
          <CalendarIcon data-icon="inline-start" />
          Events
        </TabsTrigger>
        <TabsTrigger value="groups">
          <Link2Icon data-icon="inline-start" />
          Groups
        </TabsTrigger>
        <TabsTrigger value="workspace">
          <GlobeIcon data-icon="inline-start" />
          Workspace
        </TabsTrigger>
        <TabsTrigger value="localization">
          <LanguagesIcon data-icon="inline-start" />
          Localization
        </TabsTrigger>
      </TabsList>

      <TabsContent value="join">
        <div className="max-w-2xl pt-6">
          <JoinPageSettingsForm organization={organization} policy={policy} />
        </div>
      </TabsContent>

      <TabsContent value="legal">
        <div className="pt-6">
          <LegalSettingsCard documents={policyDocuments} />
        </div>
      </TabsContent>

      <TabsContent value="membership">
        <div className="max-w-2xl pt-6">
          <MembershipSettingsCard
            state={membershipState}
            locale={membershipLocale}
            feeManagingCategoryName={feeManagingCategoryName}
          />
        </div>
      </TabsContent>

      <TabsContent value="notifications">
        <div className="max-w-2xl pt-6">
          <EmailNotificationSettingsCard state={emailNotificationState} />
        </div>
      </TabsContent>

      <TabsContent value="events">
        <div className="max-w-2xl pt-6">
          <EventsSettingsCard state={eventSettingsState} />
        </div>
      </TabsContent>

      <TabsContent value="groups">
        <div className="pt-6">
          <GroupLinksSettingsCard
            links={workspaceLinks}
            workspaceConnected={workspaceState.connected}
          />
        </div>
      </TabsContent>

      <TabsContent value="workspace">
        <div className="max-w-2xl pt-6">
          <WorkspaceSettingsCard state={workspaceState} />
        </div>
      </TabsContent>

      <TabsContent value="localization">
        <div className="max-w-2xl pt-6">
          <LocalizationSettingsCard state={localizationState} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
