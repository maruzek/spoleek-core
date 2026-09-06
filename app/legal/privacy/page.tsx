import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n";
import { getAppOrganization, getOrganizationPolicy } from "@/server/queries/app";

export default async function PrivacyPage() {
  const t = getDictionary();
  const organization = await getAppOrganization();

  if (!organization) {
    redirect("/setup");
  }

  const policy = await getOrganizationPolicy(organization.id);

  if (!policy) {
    redirect("/setup");
  }

  return (
    <main className="min-h-screen public-surface px-6 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <Button asChild variant="ghost">
            <Link href="/join">
              <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
              {t.legal.backToApplication}
            </Link>
          </Button>
        </div>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t.legal.privacyTitle}</CardTitle>
            <CardDescription>{organization.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
              {policy.privacyPolicyText}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
