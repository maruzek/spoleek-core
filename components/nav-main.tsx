"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import type { LucideIcon } from "lucide-react"
import { ChevronRightIcon } from "lucide-react"

export type NavMainSubItem = {
  title: string
  href: string
  exact?: boolean
  items?: NavMainSubItem[]
}

export type NavMainItem = {
  title: string
  href: string
  icon: LucideIcon
  exact?: boolean
  items?: NavMainSubItem[]
}

function isItemActive(pathname: string, href: string, exact = false) {
  if (exact) {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

function isSubtreeActive(pathname: string, items: NavMainSubItem[]): boolean {
  return items.some(
    (item) =>
      isItemActive(pathname, item.href, item.exact) ||
      (item.items?.length ? isSubtreeActive(pathname, item.items) : false),
  )
}

function NavSubItems({
  items,
  pathname,
}: {
  items: NavMainSubItem[]
  pathname: string
}): React.JSX.Element {
  return (
    <SidebarMenuSub>
      {items.map((item) => {
        const isActive = isItemActive(pathname, item.href, item.exact)
        const isOpen =
          item.items?.length != null && item.items.length > 0
            ? isActive || isSubtreeActive(pathname, item.items)
            : false

        if (!item.items?.length) {
          return (
            <SidebarMenuSubItem key={item.href}>
              <SidebarMenuSubButton asChild isActive={isActive}>
                <Link href={item.href}>
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          )
        }

        return (
          <Collapsible key={item.href} asChild defaultOpen={isOpen}>
            <SidebarMenuSubItem>
              <div className="flex items-center gap-1">
                <SidebarMenuSubButton asChild isActive={isActive} className="min-w-0 flex-1">
                  <Link href={item.href}>
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuSubButton>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-[state=open]:rotate-90 [&>svg]:size-4 [&>svg]:shrink-0"
                  >
                    <ChevronRightIcon />
                    <span className="sr-only">Toggle {item.title}</span>
                  </button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent>
                <NavSubItems items={item.items} pathname={pathname} />
              </CollapsibleContent>
            </SidebarMenuSubItem>
          </Collapsible>
        )
      })}
    </SidebarMenuSub>
  )
}

export function NavMain({
  label,
  items,
}: {
  label: string
  items: NavMainItem[]
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible
            key={item.href}
            asChild
            defaultOpen={
              isItemActive(pathname, item.href, item.exact) ||
              (item.items?.length ? isSubtreeActive(pathname, item.items) : false)
            }
          >
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                isActive={isItemActive(pathname, item.href, item.exact)}
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
              {item.items?.length ? (
                <>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuAction className="data-[state=open]:rotate-90">
                      <ChevronRightIcon />
                      <span className="sr-only">Toggle</span>
                    </SidebarMenuAction>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <NavSubItems items={item.items} pathname={pathname} />
                  </CollapsibleContent>
                </>
              ) : null}
            </SidebarMenuItem>
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
