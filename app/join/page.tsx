import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { PublicJoinForm } from "@/components/app/public-join-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getAppOrganization, getOrganizationJoinPage } from "@/server/queries/app";
import { listActiveMemberCustomFields } from "@/server/queries/member-custom-fields";

export default async function JoinPage() {
  const organization = await getAppOrganization();

  if (!organization) {
    redirect("/setup");
  }

  const [joinPage, registrationFields] = await Promise.all([
    getOrganizationJoinPage(organization.id),
    listActiveMemberCustomFields(organization.id, ["registration"]),
  ]);

  if (!joinPage) {
    redirect("/setup");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(214,240,224,0.9),_rgba(249,246,238,0.92)_38%,_rgba(244,238,227,0.98)_100%)] px-6 py-10 text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost">
            <Link href="/">
              <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
              Back
            </Link>
          </Button>
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            {organization.name}
          </p>
        </div>

        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="flex flex-col justify-center gap-5 px-1 py-4">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Public application
            </p>
            <h1 className="max-w-xl text-4xl leading-tight font-semibold text-balance md:text-6xl">
              {joinPage.joinPageHeadline}
            </h1>
            <p className="max-w-xl whitespace-pre-line text-base leading-8 text-muted-foreground">
              {joinPage.joinPageBody}
            </p>
            <Separator className="max-w-28" />
            <p className="max-w-lg text-sm leading-7 text-muted-foreground">
              Submit the form once. If the organization needs anything else, they can follow up
              with you directly.
            </p>
          </div>

          <Card className="border-border/70 bg-card/95 shadow-[0_24px_60px_-28px_rgba(16,24,40,0.3)] backdrop-blur">
            <CardHeader className="gap-3">
              <CardTitle className="text-2xl">Apply to join</CardTitle>
              <CardDescription className="text-sm leading-6">
                Fill in your contact details, answer the organization&apos;s questions, and submit
                your application for review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PublicJoinForm
                customFields={registrationFields}
                termsLabel={joinPage.termsOfServiceLabel}
                privacyLabel={joinPage.privacyPolicyLabel}
              />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
