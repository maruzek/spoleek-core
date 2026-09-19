import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { AppPage } from "@/components/app/app-page";
import { EmailHealth } from "@/components/app/emails/email-health";
import { Button } from "@/components/ui/button";
import { requireAdminAccess } from "@/server/queries/access";
import { requireViewer } from "@/server/queries/viewer";
import { getOrganizationEmailHealth, getProviderEmailHealth } from "@/server/queries/email-health";

export default async function AdminEmailHealthPage() {
  const viewer = await requireViewer();
  const { organization, isSystemAdmin } = await requireAdminAccess(viewer, {
    requireFullAccess: true,
    capability: "canManageOrganization",
  });

  // The provider view is account-wide; an org admin only gets their own numbers.
  const [health, provider] = await Promise.all([
    getOrganizationEmailHealth(organization.id),
    isSystemAdmin ? getProviderEmailHealth() : Promise.resolve(null),
  ]);

  return (
    <AppPage
      eyebrow="Administration"
      title="Email delivery health"
      description="Whether the emails Spoleek sends on your behalf actually arrive, and what to fix when they do not."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/email">
            <ArrowLeftIcon data-icon="inline-start" />
            Email activity
          </Link>
        </Button>
      }
    >
      <EmailHealth organization={health} provider={provider} />
    </AppPage>
  );
}
