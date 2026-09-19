import { notFound } from "next/navigation";
import { CalendarCheckIcon, TagIcon } from "lucide-react";

import { PAGE_WIDTH } from "@/components/app/app-page";
import { DetailHeader, DetailMeta, DetailMetaItem } from "@/components/app/detail-header";
import { Notice } from "@/components/ui/notice";
import { formatDateTime } from "@/lib/format";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import {
  getPolicyDocumentBySlug,
  getPolicyVersionByLabel,
  listMemberAcknowledgements,
} from "@/server/queries/policies";
import { requireViewer } from "@/server/queries/viewer";

/**
 * One version of a legal document, read from inside the portal.
 *
 * The public `/legal/<slug>/v/<version>` route shows the same text to anyone.
 * This one exists so a signed-in member stays in the shell and sees the one
 * fact only their own record can add: when they responded to this version.
 */
export default async function PortalLegalVersionPage({
  params,
}: {
  params: Promise<{ slug: string; version: string }>;
}) {
  const { slug, version: versionLabel } = await params;
  const viewer = await requireViewer();
  const { member, organization } = await requireCurrentMemberAccess(viewer, {
    requirePolicyAcknowledgement: true,
  });

  const document = await getPolicyDocumentBySlug(organization.id, slug);

  if (!document) {
    notFound();
  }

  const version = await getPolicyVersionByLabel(
    document.id,
    decodeURIComponent(versionLabel),
  );

  // A draft has no public text yet; showing it would leak unpublished wording.
  if (!version || version.status === "draft") {
    notFound();
  }

  const acknowledgements = await listMemberAcknowledgements(organization.id, member.id);
  const acknowledgement = acknowledgements.find((row) => row.versionId === version.id);
  const isSuperseded = version.status === "archived";

  return (
    <div className={`${PAGE_WIDTH.content} flex flex-1 flex-col gap-6 pb-8`}>
      <DetailHeader
        backHref="/portal/profile"
        backLabel="Your profile"
        title={document.title}
        meta={
          <DetailMeta>
            <DetailMetaItem icon={<TagIcon aria-hidden />}>
              Version {version.version}
              {version.effectiveFrom
                ? ` · in force from ${formatDateTime(version.effectiveFrom)}`
                : ""}
            </DetailMetaItem>
            {acknowledgement ? (
              <DetailMetaItem icon={<CalendarCheckIcon aria-hidden />}>
                {document.requiresAcceptance ? "You accepted it on " : "You confirmed reading it on "}
                {formatDateTime(acknowledgement.acknowledgedAt)}
              </DetailMetaItem>
            ) : null}
          </DetailMeta>
        }
      />

      {isSuperseded ? (
        <Notice
          tone="neutral"
          title="This version is no longer in force"
          description="It is kept on record because members responded to it. The current version is the one you responded to most recently."
        />
      ) : null}

      {version.summaryOfChanges ? (
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">What changed: </strong>
          {version.summaryOfChanges}
        </p>
      ) : null}

      <div
        className="policy-prose"
        // Sanitized server-side at publish time; never re-transformed on
        // read, so this renders exactly what the member responded to.
        dangerouslySetInnerHTML={{ __html: version.bodyHtml }}
      />
    </div>
  );
}
