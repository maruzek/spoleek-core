"use client"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

import Link from "next/link"
import { usePathname } from "next/navigation"

import type { AppShellContext } from "@/lib/app-shell"
import {
  BookOpenIcon,
  CalendarDaysIcon,
  CreditCardIcon,
  FolderTreeIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  Settings2Icon,
  ShieldIcon,
  TerminalIcon,
  UserCircle2Icon,
  UsersIcon,
} from "lucide-react"

function getSidebarData(appContext: AppShellContext) {
  const portalItems = [
    {
      title: "Overview",
      href: "/portal",
      icon: LayoutDashboardIcon,
    },
    {
      title: "Profile",
      href: "/portal/profile",
      icon: UserCircle2Icon,
    },
    {
      title: "My Groups",
      href: "/portal/groups",
      icon: FolderTreeIcon,
    },
    {
      title: "Events",
      href: "/portal/events",
      icon: CalendarDaysIcon,
    },
    {
      title: "Forms",
      href: "/portal/forms",
      icon: BookOpenIcon,
    },
    {
      title: "Payments",
      href: "/portal/payments",
      icon: CreditCardIcon,
    },
  ]

  const adminItems = [
    {
      title: "Dashboard",
      href: "/admin",
      icon: ShieldIcon,
    },
    {
      title: "Members",
      href: "/admin/members",
      icon: UsersIcon,
    },
    {
      title: "Groups",
      href: "/admin/groups",
      icon: FolderTreeIcon,
    },
    {
      title: "Group Categories",
      href: "/admin/group-categories",
      icon: FolderTreeIcon,
    },
    {
      title: "Events",
      href: "/admin/events",
      icon: CalendarDaysIcon,
    },
    {
      title: "Forms",
      href: "/admin/forms",
      icon: BookOpenIcon,
    },
    {
      title: "Payments",
      href: "/admin/payments",
      icon: CreditCardIcon,
    },
    {
      title: "Settings",
      href: "/admin/settings",
      icon: Settings2Icon,
    },
    {
      title: "Custom Fields",
      href: "/admin/settings/custom-fields",
      icon: Settings2Icon,
    },
  ].filter((item) => {
    if (item.href === "/admin/members") {
      return appContext.capabilities.canManageMembers
    }

    if (item.href === "/admin/settings" || item.href === "/admin/settings/custom-fields") {
      return appContext.capabilities.canManageOrganization
    }

    return appContext.capabilities.canAccessAdmin
  })

  const secondaryItems = [
    {
      title: "Portal",
      href: "/portal",
      icon: UserCircle2Icon,
    },
    {
      title: "Help",
      href: "/",
      icon: LifeBuoyIcon,
    },
  ].filter((item) => item.href !== "/portal" || appContext.capabilities.canAccessPortal)

  return {
    portalItems,
    adminItems,
    secondaryItems,
  }
}

export function AppSidebar({
  appContext,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  appContext: AppShellContext
}) {
  const pathname = usePathname()
  const { adminItems, portalItems, secondaryItems } = getSidebarData(appContext)
  const isAdminSection = pathname.startsWith("/admin")

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={isAdminSection ? "/admin" : "/portal"}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <TerminalIcon />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{appContext.organization.name}</span>
                  <span className="truncate text-xs">
                    {isAdminSection ? "Administration" : "Member portal"}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {appContext.capabilities.canAccessPortal ? (
          <NavMain label="Portal" items={portalItems} />
        ) : null}
        {appContext.capabilities.canAccessAdmin ? (
          <NavMain label="Administration" items={adminItems} />
        ) : null}
        <NavSecondary items={secondaryItems} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: appContext.viewer.name,
            email: appContext.viewer.email,
            avatar: appContext.viewer.avatar,
            portalHref: appContext.capabilities.canAccessPortal ? "/portal" : null,
            adminHref: appContext.capabilities.canAccessAdmin ? "/admin" : null,
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
