import { AppPage } from "@/components/app/app-page";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdminAccess } from "@/server/queries/access";

export default async function AdminSettingsPage() {
  await requireAdminAccess({
    requireFullAccess: true,
    capability: "canManageOrganization",
  });

  return (
    <AppPage
      eyebrow="Administration"
      title="Organization-level settings remain restricted."
      description="Only full organization admins should manage high-impact organization settings, policies, and future workspace integrations."
    >
      <div className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-foreground">
            Organization settings
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Custom member fields are the first organization-wide settings module
            in this area. More policy, workspace, and compliance controls can
            land here later without widening access.
          </p>
          <div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/admin/settings/custom-fields">Manage custom fields</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin/settings/join">Manage join page</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin/settings/workspace">
                  Manage Google Workspace
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppPage>
  );
}
