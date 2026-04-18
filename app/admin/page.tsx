import Link from "next/link";

import { AppPage } from "@/components/app/app-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdminAccess } from "@/server/queries/access";

export default async function AdminOverviewPage() {
  const { adminAccessLevel, capabilities } = await requireAdminAccess();

  const cards = [
    {
      title: "Members",
      description:
        adminAccessLevel === "full"
          ? "Approve, link, and manage member records across the organization."
          : capabilities.canManageScopedMembers
            ? "Manage members assigned to the groups you administer in delegated categories."
            : "Member management becomes available when one of your administered categories enables delegated member admin.",
      href:
        capabilities.canManageMembers || capabilities.canManageScopedMembers
          ? "/admin/members"
          : undefined,
      cta:
        capabilities.canManageMembers || capabilities.canManageScopedMembers
          ? "Open members"
          : "No delegated member scope yet",
    },
    {
      title: "Groups",
      description:
        "Use the shared admin shell to manage groups, categories, and delegated management flows.",
      href: "/admin/groups",
      cta: "Open groups",
    },
    {
      title: "Events",
      description:
        "Events, forms, payments, and exports will live alongside member operations in this area.",
      href: "/admin/events",
      cta: "Open events",
    },
  ];

  return (
    <AppPage
      eyebrow="Administration"
      title="Run your organization from one shared operations space."
      description="Org admins and delegated group admins now share the same admin shell. Full organization control stays with org admins, while scoped leader permissions can plug into the same structure safely."
      actions={
        <Badge variant={adminAccessLevel === "full" ? "default" : "secondary"}>
          {adminAccessLevel === "full" ? "Full admin access" : "Scoped admin access"}
        </Badge>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader>
              <CardTitle>{card.title}</CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {card.href ? (
                <Button asChild variant="outline">
                  <Link href={card.href}>{card.cta}</Link>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">{card.cta}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </AppPage>
  );
}
