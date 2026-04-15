import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/shell";
import { JoinForm } from "@/components/app/join-form";
import { getAppOrganization, getOrganizationPolicy } from "@/server/queries/app";
import { requireViewerSession } from "@/server/queries/auth";
import { getTenantMemberByUserId } from "@/server/queries/members";

export default async function JoinPage() {
  const session = await requireViewerSession();
  const organization = await getAppOrganization();

  if (!organization) {
    redirect("/setup");
  }

  const member = await getTenantMemberByUserId(organization.id, session.user.id);

  if (member?.acceptedTermsAt && member?.acceptedPrivacyAt) {
    redirect("/portal");
  }

  const policy = await getOrganizationPolicy(organization.id);

  if (!policy) {
    redirect("/setup");
  }

  return (
    <AppShell
      eyebrow="Member onboarding"
      title={`Join ${organization.name}`}
      description="Accept the organization policies and complete the minimum profile details needed to create or link your membership record."
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
        <JoinForm
          termsLabel={policy.termsOfServiceLabel}
          privacyLabel={policy.privacyPolicyLabel}
        />
      </section>
    </AppShell>
  );
}
