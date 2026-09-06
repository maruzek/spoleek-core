import { redirect } from "next/navigation";

import { AppPage } from "@/components/app/app-page";
import {
  PolicyAcknowledgementForm,
  type OutstandingPolicy,
} from "@/components/app/policy-acknowledgement-form";
import { db } from "@/server/db";
import { memberPolicyAcknowledgements, policyVersions } from "@/server/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { listOutstandingPolicies } from "@/server/queries/policies";

/**
 * The gate every portal page redirects to while a document is outstanding.
 *
 * Deliberately NOT gated itself — `requireCurrentMemberAccess` is called with
 * no options here, or the page that clears the block would redirect to itself.
 */
export default async function PortalLegalPage() {
  const { member, organization } = await requireCurrentMemberAccess();

  const outstanding = await listOutstandingPolicies(organization.id, member.id);

  // Nothing to do: either the member arrived by hand or another tab already
  // cleared it. Either way the portal is theirs.
  if (outstanding.length === 0) {
    redirect("/portal");
  }

  // "First time" versus "you agreed to an earlier version" changes what the
  // member is being told, so it is resolved from the record rather than
  // guessed from whether a previous version exists.
  const documentIds = outstanding.map((entry) => entry.document.id);
  const priorAcknowledgements = await db
    .select({ documentId: policyVersions.documentId })
    .from(memberPolicyAcknowledgements)
    .innerJoin(
      policyVersions,
      eq(policyVersions.id, memberPolicyAcknowledgements.policyVersionId),
    )
    .where(
      and(
        eq(memberPolicyAcknowledgements.memberId, member.id),
        inArray(policyVersions.documentId, documentIds),
      ),
    );

  const seenDocumentIds = new Set(
    priorAcknowledgements.map((row) => row.documentId),
  );

  const policies: OutstandingPolicy[] = outstanding.map(({ document, version }) => ({
    versionId: version.id,
    documentId: document.id,
    title: document.title,
    version: version.version ?? "",
    summaryOfChanges: version.summaryOfChanges,
    bodyHtml: version.bodyHtml,
    requiresAcceptance: document.requiresAcceptance,
    firstTime: !seenDocumentIds.has(document.id),
  }));

  return (
    <AppPage
      eyebrow="Before you continue"
      title={
        policies.length === 1
          ? policies[0].title
          : "Please review these documents"
      }
      description={
        policies.some((policy) => policy.firstTime)
          ? "These set out the terms of your membership and how your personal data is handled. We need your response before you can use the portal."
          : "These have been updated since you last responded. We need your response before you can use the portal."
      }
    >
      <div className="max-w-3xl">
        <PolicyAcknowledgementForm policies={policies} />
      </div>
    </AppPage>
  );
}
