"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  DownloadIcon,
  FolderTreeIcon,
  LogOutIcon,
  MailIcon,
  PlayIcon,
  PlusIcon,
  ScaleIcon,
  SearchIcon,
  Settings2Icon,
  SunMoonIcon,
  UploadIcon,
  UserCircle2Icon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { useAppShell } from "@/components/app/app-shell-provider";
import { useDictionary, useFormatters } from "@/components/locale-provider";
import { authClient } from "@/lib/auth/client";
import {
  COMMAND_SEARCH_MIN_LENGTH,
  SETTINGS_INDEX,
  adminNavItems,
  settingsHref,
  type PaletteSettingItem,
} from "@/lib/command-palette";
import { matchesSearch } from "@/lib/search";
import { paletteHref } from "@/hooks/use-palette-intent";
import { commandSearchAction } from "@/server/actions/command-search";
import { exportMemberDataAction } from "@/server/actions/member-data-export";
import { resendMemberInviteAction } from "@/server/actions/member-admin";
import type {
  CommandSearchEntity,
  CommandSearchResult,
} from "@/server/queries/command-search";

const SEARCH_DEBOUNCE_MS = 200;
const MEMBER_DETAIL_PATTERN = /^\/admin\/members\/([0-9a-f-]{36})$/i;

const ENTITY_ICONS: Record<CommandSearchEntity, LucideIcon> = {
  members: UserIcon,
  groups: FolderTreeIcon,
  categories: FolderTreeIcon,
  events: CalendarDaysIcon,
  reports: ClipboardCheckIcon,
  policies: ScaleIcon,
};

type QuickAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  keywords?: string[];
  run: () => void | Promise<void>;
};

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function saveJson(filename: string, json: string) {
  const url = URL.createObjectURL(
    new Blob([json], { type: "application/json;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `router.push` keeps the scroll position on a same-page `#hash`; do it by hand. */
function scrollToHash(href: string) {
  const hash = href.split("#")[1];
  if (!hash) return;
  window.setTimeout(() => {
    const target = document.getElementById(hash);
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  }, 250);
}

/**
 * The admin ⌘K palette and the header search that opens it.
 *
 * One component, two entry points: the visible search field in the header and
 * the global shortcut. Both open the same dialog, so there is exactly one list
 * of navigation targets, settings and quick actions to keep in step. It never
 * runs a destructive mutation — see the build spec: create flows are launched
 * on their own page through `?action=` (`hooks/use-palette-intent.ts`).
 */
export function CommandPalette() {
  const t = useDictionary().commandPalette;
  const context = useAppShell();
  const router = useRouter();
  const pathname = usePathname();
  const { formatDate } = useFormatters();
  const { setTheme, resolvedTheme } = useTheme();

  const [open, setOpenState] = useState(false);
  const [query, setQuery] = useState("");
  // Every open starts from a blank query; the previous search must not flash
  // back before the user types. Clearing on close as well keeps the toggle
  // shortcut simple.
  const setOpen = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      setQuery("");
      setOpenState(next);
    },
    [],
  );
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);

  const isAdminSection = pathname.startsWith("/admin");
  // Record search is org-admin only (`orgAdminActionClient`); a scoped admin
  // still gets navigation and actions.
  const canSearchRecords = context.adminAccessLevel === "full";

  // ⌘K / Ctrl+K anywhere in the admin shell.
  useEffect(() => {
    if (!isAdminSection) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isAdminSection, setOpen]);

  // ─── Record search ─────────────────────────────────────────────────────

  const search = useAction(commandSearchAction);
  const executeSearch = search.execute;
  const searchable =
    canSearchRecords && debouncedQuery.length >= COMMAND_SEARCH_MIN_LENGTH;

  useEffect(() => {
    if (!open || !searchable) return;
    executeSearch({ query: debouncedQuery });
  }, [open, searchable, debouncedQuery, executeSearch]);

  // A response for an older query must not overwrite the current list.
  const results: CommandSearchResult | null =
    searchable && search.result.data?.query === debouncedQuery
      ? search.result.data
      : null;
  const isSearching =
    searchable && (search.isPending || query.trim() !== debouncedQuery);

  // ─── Static entries ────────────────────────────────────────────────────

  const navItems = useMemo(
    () =>
      adminNavItems(
        t.nav,
        context.capabilities,
        context.organization.membershipReportEnabled,
      ),
    [t.nav, context.capabilities, context.organization.membershipReportEnabled],
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  const navigate = useCallback(
    (href: string) => {
      close();
      router.push(href);
      scrollToHash(href);
    },
    [close, router],
  );

  const memberDetailId = pathname.match(MEMBER_DETAIL_PATTERN)?.[1] ?? null;

  const resendInvite = useAction(resendMemberInviteAction, {
    onSuccess: ({ data }) =>
      data?.sent
        ? toast.success(t.actions.inviteSent)
        : toast.error(data?.reason ?? t.actions.inviteFailed),
    onError: ({ error }) =>
      toast.error(error.serverError ?? t.actions.inviteFailed),
  });
  const exportMember = useAction(exportMemberDataAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      saveJson(data.filename, data.json);
      toast.success(t.actions.exportDone);
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? t.actions.exportFailed),
  });

  const capabilities = context.capabilities;
  const canManageOrg = capabilities.canManageOrganization;

  const quickActions: QuickAction[] = useMemo(() => {
    const items: (QuickAction | false)[] = [
      (capabilities.canManageMembers || capabilities.canManageScopedMembers) && {
        id: "action-new-member",
        label: t.actions.newMember,
        icon: PlusIcon,
        keywords: ["create", "add", "člen"],
        run: () => navigate(paletteHref("/admin/members", { action: "new" })),
      },
      (capabilities.canManageMembers || capabilities.canManageScopedMembers) && {
        id: "action-import-members",
        label: t.actions.importMembers,
        icon: UploadIcon,
        keywords: ["csv", "upload"],
        run: () => navigate(paletteHref("/admin/members", { action: "import" })),
      },
      capabilities.canManageGroups && {
        id: "action-new-category",
        label: t.actions.newCategory,
        icon: PlusIcon,
        keywords: ["create", "add", "kategorie"],
        run: () => navigate(paletteHref("/admin/groups", { action: "new" })),
      },
      capabilities.canManageGroups && {
        id: "action-new-group",
        label: t.actions.newGroup,
        icon: PlusIcon,
        keywords: ["create", "add", "skupina"],
        // A group lives in a category, so the palette goes to the pinned
        // category when there is exactly one, otherwise to the category list.
        run: () => {
          const pins = context.navigation.adminGroupPins;
          const target =
            pins.length === 1
              ? paletteHref(pins[0].href, { action: "new" })
              : "/admin/groups";
          navigate(target);
        },
      },
      capabilities.canManageEvents && {
        id: "action-new-event",
        label: t.actions.newEvent,
        icon: PlusIcon,
        keywords: ["create", "add", "akce"],
        run: () => navigate(paletteHref("/admin/events", { action: "new" })),
      },
      canManageOrg &&
        context.organization.membershipReportEnabled && {
          id: "action-open-report",
          label: t.actions.openReport,
          icon: PlayIcon,
          keywords: ["generate", "report", "výkaz"],
          run: () =>
            navigate(paletteHref("/admin/reports", { action: "open-report" })),
        },
      {
        id: "action-toggle-theme",
        label: t.actions.toggleTheme,
        icon: SunMoonIcon,
        keywords: ["dark", "light", "mode", "tmavý", "světlý"],
        run: () => {
          close();
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
        },
      },
      capabilities.canAccessPortal && {
        id: "action-my-profile",
        label: t.actions.myProfile,
        icon: UserCircle2Icon,
        keywords: ["account", "me", "profil"],
        run: () => navigate("/portal/profile"),
      },
      {
        id: "action-sign-out",
        label: t.actions.signOut,
        icon: LogOutIcon,
        keywords: ["logout", "odhlásit"],
        run: async () => {
          close();
          await authClient.signOut();
          window.location.href = "/";
        },
      },
    ];
    return items.filter((item): item is QuickAction => Boolean(item));
  }, [
    capabilities,
    canManageOrg,
    context.navigation.adminGroupPins,
    context.organization.membershipReportEnabled,
    t.actions,
    navigate,
    close,
    setTheme,
    resolvedTheme,
  ]);

  const pageActions: QuickAction[] = useMemo(() => {
    if (!memberDetailId) return [];
    return [
      {
        id: "page-resend-invite",
        label: t.actions.resendInvite,
        icon: MailIcon,
        keywords: ["invitation", "activation", "email", "pozvánka"],
        run: () => {
          close();
          resendInvite.execute({ memberId: memberDetailId });
        },
      },
      {
        id: "page-export-member",
        label: t.actions.exportMember,
        icon: DownloadIcon,
        keywords: ["gdpr", "download", "json", "export"],
        run: () => {
          close();
          exportMember.execute({ memberId: memberDetailId });
        },
      },
    ];
  }, [memberDetailId, t.actions, close, resendInvite, exportMember]);

  // Filtering is done here rather than by cmdk so that "ver" finds "Veřejná"
  // — the same accent-insensitive rule the server applies to records.
  const trimmed = query.trim();
  const matchesStatic = (label: string, keywords: string[] = []) =>
    matchesSearch([label, ...keywords].join(" "), trimmed);

  const visibleNav = navItems.filter((item) =>
    matchesStatic(item.label, item.keywords),
  );
  const visibleSettings: PaletteSettingItem[] =
    canManageOrg && trimmed.length > 0
      ? SETTINGS_INDEX.filter((item) =>
          matchesStatic(item.label, item.keywords),
        )
      : [];
  const visibleActions = quickActions.filter((item) =>
    matchesStatic(item.label, item.keywords),
  );
  const visiblePageActions = pageActions.filter((item) =>
    matchesStatic(item.label, item.keywords),
  );

  const resultGroups = results?.groups ?? [];
  const hasAnything =
    visibleNav.length +
      visibleSettings.length +
      visibleActions.length +
      visiblePageActions.length +
      resultGroups.length >
    0;

  if (!isAdminSection || !context.capabilities.canAccessAdmin) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="Control+K Meta+K"
        className={
          open
            ? "invisible"
            : "h-8 w-8 justify-start px-0 text-muted-foreground sm:w-56 sm:px-2.5"
        }
      >
        <SearchIcon data-icon="inline-start" className="mx-auto sm:mx-0" />
        <span className="hidden flex-1 text-left font-normal sm:inline">
          {t.searchButton}
        </span>
        <kbd className="pointer-events-none hidden select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t.title}
        description={t.description}
        className="sm:max-w-xl"
      >
        <Command shouldFilter={false} loop>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t.placeholder}
          />
          <CommandList className="max-h-[60vh]">
            {!hasAnything && !isSearching ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t.noResults}
              </div>
            ) : null}

            {visiblePageActions.length > 0 ? (
              <CommandGroup heading={t.groups.thisPage}>
                {visiblePageActions.map((item) => (
                  <ActionItem key={item.id} item={item} />
                ))}
              </CommandGroup>
            ) : null}

            {resultGroups.map((group) => {
              const Icon = ENTITY_ICONS[group.entity];
              const remaining = group.total - group.hits.length;
              return (
                <CommandGroup
                  key={group.entity}
                  heading={t.groups[group.entity]}
                >
                  {group.hits.map((hit) => (
                    <CommandItem
                      key={`${group.entity}-${hit.id}`}
                      value={`${group.entity}-${hit.id}`}
                      onSelect={() => navigate(hit.href)}
                    >
                      <Icon />
                      <span className="truncate">{hit.title}</span>
                      {hit.date ? (
                        <CommandShortcut className="tracking-normal">
                          {formatDate(hit.date)}
                        </CommandShortcut>
                      ) : hit.subtitle ? (
                        <CommandShortcut className="max-w-[40%] truncate tracking-normal">
                          {hit.subtitle}
                        </CommandShortcut>
                      ) : null}
                    </CommandItem>
                  ))}
                  {remaining > 0 ? (
                    <CommandItem
                      value={`${group.entity}-see-all`}
                      onSelect={() => navigate(group.seeAllHref)}
                      className="text-muted-foreground"
                    >
                      <ArrowRightIcon />
                      {t.seeAll(group.total, t.groups[group.entity])}
                    </CommandItem>
                  ) : null}
                </CommandGroup>
              );
            })}

            {isSearching ? (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Spinner className="size-3" />
                {t.searching}
              </div>
            ) : canSearchRecords &&
              trimmed.length > 0 &&
              trimmed.length < COMMAND_SEARCH_MIN_LENGTH ? (
              <div className="py-2 text-center text-xs text-muted-foreground">
                {t.typeMore(COMMAND_SEARCH_MIN_LENGTH)}
              </div>
            ) : null}

            {visibleSettings.length > 0 ? (
              <CommandGroup heading={t.groups.settings}>
                {visibleSettings.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => navigate(settingsHref(item))}
                  >
                    <Settings2Icon />
                    <span className="truncate">{item.label}</span>
                    <CommandShortcut className="capitalize tracking-normal">
                      {item.tab}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {visibleNav.length > 0 ? (
              <CommandGroup heading={t.groups.navigation}>
                {visibleNav.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => navigate(item.href)}
                  >
                    <item.icon />
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {visibleActions.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading={t.groups.actions}>
                  {visibleActions.map((item) => (
                    <ActionItem key={item.id} item={item} />
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

function ActionItem({ item }: { item: QuickAction }) {
  return (
    <CommandItem value={item.id} onSelect={() => void item.run()}>
      <item.icon />
      {item.label}
    </CommandItem>
  );
}
