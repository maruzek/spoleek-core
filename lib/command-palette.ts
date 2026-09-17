import type { LucideIcon } from "lucide-react";
import {
  BellIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  CreditCardIcon,
  FileTextIcon,
  FolderTreeIcon,
  FormInputIcon,
  GlobeIcon,
  HeartPulseIcon,
  LanguagesIcon,
  Link2Icon,
  MailIcon,
  ScaleIcon,
  Settings2Icon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react";

import type { AppShellContext } from "@/lib/app-shell";
import type { Dictionary } from "@/lib/i18n/messages";

/** Shared with the server schema; a shorter query never leaves the browser. */
export const COMMAND_SEARCH_MIN_LENGTH = 2;

export type PaletteNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Extra words cmdk matches on but does not display. */
  keywords?: string[];
};

/**
 * One row in Settings, addressable from the palette.
 *
 * `anchor` is the `id` of the control (or its section heading) inside the tab,
 * so "Fee amount" lands on the input rather than just on the Membership tab.
 * Anchors are the ids the settings cards already give their fields; a control
 * that is only rendered conditionally (fee fields behind the fee switch) falls
 * back to the tab when it is not in the DOM.
 */
export type PaletteSettingItem = {
  id: string;
  label: string;
  tab: string;
  anchor?: string;
  keywords?: string[];
};

type Nav = Dictionary["commandPalette"]["nav"];

export function adminNavItems(
  t: Nav,
  capabilities: AppShellContext["capabilities"],
  membershipReportEnabled: boolean,
): PaletteNavItem[] {
  const canManageOrg = capabilities.canManageOrganization;

  return [
    { id: "nav-dashboard", label: t.dashboard, href: "/admin", icon: ShieldIcon, keywords: ["home", "overview"] },
    (capabilities.canManageMembers || capabilities.canManageScopedMembers) && {
      id: "nav-members",
      label: t.members,
      href: "/admin/members",
      icon: UsersIcon,
      keywords: ["people", "requests"],
    },
    capabilities.canManageGroups && {
      id: "nav-groups",
      label: t.groups,
      href: "/admin/groups",
      icon: FolderTreeIcon,
      keywords: ["categories"],
    },
    { id: "nav-events", label: t.events, href: "/admin/events", icon: CalendarDaysIcon, keywords: ["calendar", "rsvp"] },
    { id: "nav-forms", label: t.forms, href: "/admin/forms", icon: BookOpenIcon },
    { id: "nav-payments", label: t.payments, href: "/admin/payments", icon: CreditCardIcon, keywords: ["fees", "money"] },
    canManageOrg && membershipReportEnabled && {
      id: "nav-reports",
      label: t.reports,
      href: "/admin/reports",
      icon: ClipboardCheckIcon,
      keywords: ["membership report", "yearly"],
    },
    canManageOrg && { id: "nav-email", label: t.email, href: "/admin/email", icon: MailIcon, keywords: ["activity", "resend"] },
    canManageOrg && {
      id: "nav-email-health",
      label: t.emailHealth,
      href: "/admin/email/health",
      icon: HeartPulseIcon,
      keywords: ["spf", "dkim", "dmarc", "deliverability"],
    },
    canManageOrg && { id: "nav-settings", label: t.settings, href: "/admin/settings", icon: Settings2Icon, keywords: ["preferences"] },
    canManageOrg && { id: "nav-settings-join", label: t.settingsJoin, href: "/admin/settings?tab=join", icon: FileTextIcon, keywords: ["registration", "apply"] },
    canManageOrg && { id: "nav-settings-legal", label: t.settingsLegal, href: "/admin/settings?tab=legal", icon: ScaleIcon, keywords: ["policy", "terms", "privacy", "gdpr"] },
    canManageOrg && { id: "nav-settings-membership", label: t.settingsMembership, href: "/admin/settings?tab=membership", icon: UsersIcon, keywords: ["fees", "renewal"] },
    canManageOrg && { id: "nav-settings-notifications", label: t.settingsNotifications, href: "/admin/settings?tab=notifications", icon: BellIcon, keywords: ["email", "reminders"] },
    canManageOrg && { id: "nav-settings-events", label: t.settingsEvents, href: "/admin/settings?tab=events", icon: CalendarDaysIcon },
    canManageOrg && { id: "nav-settings-groups", label: t.settingsGroups, href: "/admin/settings?tab=groups", icon: Link2Icon, keywords: ["google groups", "links"] },
    canManageOrg && { id: "nav-settings-workspace", label: t.settingsWorkspace, href: "/admin/settings?tab=workspace", icon: GlobeIcon, keywords: ["google", "domain"] },
    canManageOrg && { id: "nav-settings-localization", label: t.settingsLocalization, href: "/admin/settings?tab=localization", icon: LanguagesIcon, keywords: ["locale", "sorting", "language"] },
    canManageOrg && { id: "nav-settings-custom-fields", label: t.settingsCustomFields, href: "/admin/settings/custom-fields", icon: FormInputIcon, keywords: ["member fields", "questions"] },
  ].filter((item): item is PaletteNavItem => Boolean(item));
}

/**
 * Every individual setting, so "IBAN" finds the bank-account field.
 *
 * Labels are the English copy the settings cards render (the admin side is
 * still English-only, see the note at the top of `lib/i18n/messages.ts`);
 * keywords add what people actually type, including Czech.
 */
export const SETTINGS_INDEX: PaletteSettingItem[] = [
  // Join page
  { id: "join-headline", label: "Join page headline", tab: "join", anchor: "join-page-headline", keywords: ["title", "registration", "přihláška", "nadpis"] },
  { id: "join-body", label: "Join page body copy", tab: "join", anchor: "join-page-body", keywords: ["text", "intro", "registration"] },
  { id: "join-min-age", label: "Minimum age to register", tab: "join", anchor: "registration-minimum-age", keywords: ["age", "věk", "children"] },
  { id: "join-max-age", label: "Membership ends at age", tab: "join", anchor: "membership-ends-at-age", keywords: ["maximum age", "věk"] },
  { id: "join-max-age-effect", label: "What happens when membership ends by age", tab: "join", anchor: "maximum-age-effect" },
  { id: "join-invite-subject", label: "Member invite email subject", tab: "join", anchor: "member-invite-email-subject", keywords: ["invitation", "pozvánka"] },
  { id: "join-invite-body", label: "Member invite email body", tab: "join", anchor: "member-invite-email-body", keywords: ["invitation", "pozvánka", "template"] },
  // Legal
  { id: "legal-documents", label: "Legal documents (terms, privacy)", tab: "legal", keywords: ["policy", "gdpr", "terms of service", "consent", "podmínky", "soukromí"] },
  // Membership
  { id: "membership-mode", label: "Membership mode", tab: "membership", anchor: "membership-mode-heading", keywords: ["management", "renewal", "lifetime", "členství"] },
  { id: "membership-period", label: "Membership period", tab: "membership", anchor: "membership-period-mode", keywords: ["calendar year", "rolling"] },
  { id: "membership-renewal-month", label: "Renewal month", tab: "membership", anchor: "renewal-month", keywords: ["obnova"] },
  { id: "membership-renewal-day", label: "Renewal day", tab: "membership", anchor: "renewal-day" },
  { id: "membership-fee-enabled", label: "Require fee payment", tab: "membership", anchor: "membership-fee-enabled", keywords: ["fees", "příspěvek", "dues"] },
  { id: "membership-fee-amount", label: "Fee amount", tab: "membership", anchor: "fee-amount", keywords: ["price", "částka", "příspěvek"] },
  { id: "membership-bank-account", label: "Bank account (IBAN)", tab: "membership", anchor: "fee-bank-account", keywords: ["iban", "účet", "payment", "qr"] },
  { id: "membership-payment-window", label: "Payment window (days)", tab: "membership", anchor: "payment-window-days", keywords: ["due", "deadline", "splatnost"] },
  { id: "membership-report-enabled", label: "Enable the yearly member report", tab: "membership", anchor: "membership-report-enabled", keywords: ["report", "výkaz", "roster"] },
  { id: "membership-report-deadline", label: "Report confirmation deadline", tab: "membership", anchor: "membership-report-deadline-enabled", keywords: ["report", "deadline", "termín"] },
  { id: "membership-report-self-approval", label: "Allow self-approval of group reports", tab: "membership", anchor: "membership-report-self-approval", keywords: ["report", "approve"] },
  // Notifications
  { id: "notify-renewal-headsup", label: "Renewal heads-up email", tab: "notifications", anchor: "notify-renewal-headsup", keywords: ["reminder", "days before", "upozornění"] },
  { id: "notify-overdue", label: "Overdue payment email", tab: "notifications", anchor: "notify-overdue", keywords: ["reminder", "late", "po splatnosti"] },
  { id: "notify-payment-confirmed", label: "Payment confirmed email", tab: "notifications", anchor: "notify-payment-confirmed", keywords: ["receipt", "potvrzení"] },
  { id: "notify-report-reminder", label: "Report reminder email", tab: "notifications", anchor: "notify-report-reminder", keywords: ["výkaz"] },
  { id: "notify-registration", label: "New registration notification", tab: "notifications", anchor: "notify-registration", keywords: ["join", "admins", "shared address", "přihláška"] },
  // Events
  { id: "events-creators", label: "Who can create organization-wide events", tab: "events", anchor: "event-creators", keywords: ["permissions", "leaders"] },
  { id: "events-guest-retention", label: "Delete guest data after an event", tab: "events", anchor: "event-retention", keywords: ["retention", "gdpr", "guests", "hosté"] },
  // Groups
  { id: "groups-links", label: "Linked Google groups", tab: "groups", keywords: ["mailing list", "workspace", "google groups"] },
  // Workspace
  { id: "workspace-module", label: "Google Workspace integration", tab: "workspace", anchor: "workspace-module", keywords: ["google", "connect", "sync"] },
  { id: "workspace-domain", label: "Workspace domain", tab: "workspace", anchor: "workspace-domain", keywords: ["google", "doména"] },
  { id: "workspace-template", label: "Workspace email template", tab: "workspace", anchor: "workspace-template", keywords: ["first.last", "username", "address"] },
  { id: "workspace-preferred-email", label: "Default preferred email", tab: "workspace", anchor: "pref-personal", keywords: ["personal", "workspace"] },
  { id: "workspace-org-unit", label: "Workspace org unit category", tab: "workspace", anchor: "workspace-org-unit", keywords: ["organizational unit", "ou"] },
  // Localization
  { id: "localization-sort", label: "Member name sorting locale", tab: "localization", anchor: "members-sort-locale", keywords: ["collation", "czech", "language", "řazení"] },
];

export function settingsHref(item: PaletteSettingItem) {
  return `/admin/settings?tab=${item.tab}${item.anchor ? `#${item.anchor}` : ""}`;
}
