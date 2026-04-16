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
import { getAppOrganization, getOrganizationPolicy } from "@/server/queries/app";

export default async function PrivacyPage() {
  const organization = await getAppOrganization();

  if (!organization) {
    redirect("/setup");
  }

  const policy = await getOrganizationPolicy(organization.id);

  if (!policy) {
    redirect("/setup");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(214,240,224,0.9),_rgba(249,246,238,0.92)_38%,_rgba(244,238,227,0.98)_100%)] px-6 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <Button asChild variant="ghost">
            <Link href="/join">
              <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
              Back to application
            </Link>
          </Button>
        </div>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Privacy policy</CardTitle>
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
