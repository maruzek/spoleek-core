import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PortalGroupPage } from "@/components/app/portal/portal-group-page";
import { orgFormatLocale } from "@/lib/i18n";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { getPortalGroupDetail } from "@/server/queries/portal-group-detail";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  const { member, organization } = await requireCurrentMemberAccess({
    requireProfileComplete: true,
    requirePolicyAcknowledgement: true,
  });
  const detail = await getPortalGroupDetail({ organization, member, slug });
  return { member, organization, detail };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const { detail } = await load(slug);
  return detail ? { title: detail.group.name } : {};
}

export default async function PortalGroupDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const { organization, detail } = await load(slug);

  // `null` covers "no such group" and "not for you" alike: a members-only
  // page must not confirm the group exists.
  if (!detail) notFound();

  return (
    <PortalGroupPage
      detail={detail}
      locale={orgFormatLocale(organization.locale)}
      timeZone={organization.timezone}
      canManage={detail.leaderPanel !== null}
    />
  );
}
