import { redirect } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/app/shell";
import { JoinForm } from "@/components/app/join-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { splitMemberName } from "@/lib/member-custom-fields";
import { getAppOrganization, getOrganizationPolicy } from "@/server/queries/app";
import { listActiveMemberCustomFields } from "@/server/queries/member-custom-fields";
import { getViewerSession } from "@/server/queries/auth";
import { getTenantMemberByUserId } from "@/server/queries/members";

export default async function JoinPage() {
  const organization = await getAppOrganization();

  if (!organization) {
    redirect("/setup");
  }

  const policy = await getOrganizationPolicy(organization.id);

  if (!policy) {
    redirect("/setup");
  }

  const session = await getViewerSession();
  const member = session
    ? await getTenantMemberByUserId(organization.id, session.user.id)
    : null;

  const registrationFields = await listActiveMemberCustomFields(organization.id, [
    "registration",
  ]);
  const defaultName = session
    ? splitMemberName(session.user.name)
    : { firstName: "", lastName: "" };
  const isJoined = Boolean(member?.acceptedTermsAt && member?.acceptedPrivacyAt);

  return (
    <AppShell
      eyebrow="Member onboarding"
      title={`Join ${organization.name}`}
      description="Accept the organization policies and complete the minimum profile details needed to create or link your membership record."
      actions={
        session ? (
          <Button asChild variant="outline">
            <Link href={isJoined ? "/portal" : "/"}>{isJoined ? "Open portal" : "Account"}</Link>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/">Sign in or register</Link>
          </Button>
        )
      }
    >
      <section className="grid gap-6 md:grid-cols-[0.9fr_1.1fr]">
        <article className="grid gap-4 rounded-4xl border border-slate-950/10 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
          <div>
            <p className="text-xs font-semibold tracking-[0.28em] uppercase text-slate-500">
              Terms of service
            </p>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">
              {policy.termsOfServiceText}
            </p>
          </div>
          <div className="h-px bg-slate-200" />
          <div>
            <p className="text-xs font-semibold tracking-[0.28em] uppercase text-slate-500">
              Privacy policy
            </p>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">
              {policy.privacyPolicyText}
            </p>
          </div>
        </article>
        {session ? (
          isJoined ? (
            <Card className="rounded-4xl border border-slate-950/10 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
              <CardHeader>
                <CardTitle>You have already joined.</CardTitle>
                <CardDescription>
                  Your membership record is already linked to this account, so you can continue in the portal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild size="lg">
                  <Link href="/portal">Go to portal</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <JoinForm
              termsLabel={policy.termsOfServiceLabel}
              privacyLabel={policy.privacyPolicyLabel}
              defaultFirstName={member?.firstName || defaultName.firstName}
              defaultLastName={member?.lastName || defaultName.lastName}
              customFields={registrationFields}
            />
          )
        ) : (
          <Card className="rounded-4xl border border-slate-950/10 bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
            <CardHeader>
              <CardTitle>Sign in before joining</CardTitle>
              <CardDescription>
                Review the policies here anytime, then sign in or create an account to submit your membership details.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Button asChild size="lg">
                <Link href="/">Continue to sign in</Link>
              </Button>
              <p className="text-sm leading-6 text-muted-foreground">
                After authentication, you will be able to complete the join form on this page.
              </p>
            </CardContent>
          </Card>
        )}
      </section>
    </AppShell>
  );
}
