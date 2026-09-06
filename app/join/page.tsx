import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { redirect } from "next/navigation";

import { PublicJoinForm } from "@/components/app/public-join-form";
import { PublicShell } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { defaultLocale, getDictionary } from "@/lib/i18n";
import { listRegistrationGroupCategories } from "@/server/lib/group-registration";
import { getAppOrganization, getOrganizationJoinPage } from "@/server/queries/app";
import { listPoliciesForRegistration } from "@/server/queries/policies";
import { listActiveMemberCustomFields } from "@/server/queries/member-custom-fields";

export default async function JoinPage() {
  const t = getDictionary();
  const organization = await getAppOrganization();

  if (!organization) {
    redirect("/setup");
  }

  const [joinPage, registrationFields, registrationGroupCategories, policyEntries] =
    await Promise.all([
      getOrganizationJoinPage(organization.id),
      listActiveMemberCustomFields(organization.id, ["registration"]),
      listRegistrationGroupCategories(organization.id),
      listPoliciesForRegistration(organization.id),
    ]);

  const policies = policyEntries.map(({ document, version }) => ({
    versionId: version.id,
    slug: document.slug,
    title: document.title,
    requiresAcceptance: document.requiresAcceptance,
  }));

  if (!joinPage) {
    redirect("/setup");
  }

  return (
    <PublicShell
      brand={organization.name}
      leading={
        <Button asChild variant="ghost">
          <Link href="/login">
            <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
            {t.common.back}
          </Link>
        </Button>
      }
    >
      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="flex flex-col justify-center gap-5 px-1 py-4">
          <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
            {t.join.eyebrow}
          </p>
          <h1 className="max-w-xl text-4xl leading-tight font-semibold text-balance md:text-6xl">
            {joinPage.joinPageHeadline}
          </h1>
          <p className="max-w-xl text-base leading-8 whitespace-pre-line text-muted-foreground">
            {joinPage.joinPageBody}
          </p>
          <Separator className="max-w-28" />
          <p className="max-w-lg text-sm leading-7 text-muted-foreground">
            {t.join.aside}
          </p>
        </div>

        <PublicJoinForm
          locale={defaultLocale}
          organizationName={organization.name}
          customFields={registrationFields}
          registrationGroupCategories={registrationGroupCategories}
          policies={policies}
        />
      </section>
    </PublicShell>
  );
}
