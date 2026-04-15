import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/shell";
import { ProfileForm } from "@/components/app/profile-form";
import { SignOutButton } from "@/components/app/sign-out-button";
import { formatDateTime } from "@/lib/format";
import { getAppOrganization } from "@/server/queries/app";
import { requireViewerSession } from "@/server/queries/auth";
import { getTenantMemberByUserId } from "@/server/queries/members";

export default async function PortalPage() {
  const session = await requireViewerSession();
  const organization = await getAppOrganization();

  if (!organization) {
    redirect("/setup");
  }

  const member = await getTenantMemberByUserId(organization.id, session.user.id);

  if (!member) {
    redirect("/join");
  }

  return (
    <AppShell
      eyebrow="Member portal"
      title={`Welcome back, ${session.user.name}`}
      description="This portal is intentionally narrow in the first milestone. Members can see their status, confirm their tenant linkage, and keep core contact information up to date."
      actions={<SignOutButton />}
    >
      <section className="grid gap-6 md:grid-cols-[0.85fr_1.15fr]">
        <article className="grid gap-4 rounded-4xl border border-slate-950/10 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-xs font-semibold tracking-[0.28em] uppercase text-slate-500">
              Organization
            </p>
            <p className="mt-2 text-xl font-semibold text-slate-950">
              {organization.name}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Fact label="Membership status" value={member.status} />
            <Fact label="Role" value={member.role.replace("_", " ")} />
            <Fact
              label="Policies accepted"
              value={
                member.acceptedTermsAt && member.acceptedPrivacyAt
                  ? "Yes"
                  : "Pending"
              }
            />
            <Fact label="Linked at" value={formatDateTime(member.linkedAt)} />
          </div>
          {member.status !== "active" ? (
            <p className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900">
              Your membership is waiting for admin approval. You can still keep your profile up to date while you wait.
            </p>
          ) : null}
        </article>

        <ProfileForm
          fullName={member.fullName}
          phone={member.phone}
          addressLine1={member.addressLine1}
          addressLine2={member.addressLine2}
          city={member.city}
          postalCode={member.postalCode}
          countryCode={member.countryCode}
        />
      </section>
    </AppShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-semibold tracking-[0.28em] uppercase text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold capitalize text-slate-950">{value}</p>
    </div>
  );
}
