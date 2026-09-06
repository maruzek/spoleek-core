import { sanitizePolicyHtml } from "@/server/lib/policy-html";
import { db } from "@/server/db";
import { policyDocuments, policyVersions } from "@/server/db/schema";

/**
 * Seeds a new organization's terms and privacy notice.
 *
 * A fresh org must end up with a published version of each: registration
 * requires every published document to be acknowledged, so an org with none
 * would refuse every application, and one with an unpublished draft would let
 * people join having agreed to nothing.
 *
 * The text is a placeholder on purpose. The alternative — shipping real-looking
 * legal prose nobody wrote — is worse than an obvious "replace this", because a
 * plausible default is one an admin might never read and never replace.
 */
export async function seedOrganizationPolicies(
  tx: Pick<typeof db, "insert">,
  params: {
    orgId: string;
    organizationName: string;
    locale?: string | null;
    /** Overrides for the first-run wizard, which collects real text. */
    terms?: { title?: string; html?: string };
    privacy?: { title?: string; html?: string };
  },
) {
  const czech = params.locale === "cs";
  const now = new Date();

  const documents = [
    {
      kind: "terms" as const,
      slug: "terms",
      requiresAcceptance: true,
      sortOrder: 0,
      title:
        params.terms?.title ?? (czech ? "Podmínky služby" : "Terms of service"),
      html:
        params.terms?.html ??
        `<p>${params.organizationName}${
          czech
            ? " — podmínky služby. Nahraďte tento text v nastavení, v záložce Právní dokumenty."
            : " terms of service placeholder. Replace this in the Legal settings tab."
        }</p>`,
    },
    {
      kind: "privacy" as const,
      slug: "privacy",
      // A disclosure, not an agreement: the member confirms having read it.
      requiresAcceptance: false,
      sortOrder: 1,
      title:
        params.privacy?.title ??
        (czech ? "Zásady ochrany osobních údajů" : "Privacy policy"),
      html:
        params.privacy?.html ??
        `<p>${params.organizationName}${
          czech
            ? " — zásady ochrany osobních údajů. Nahraďte tento text v nastavení, v záložce Právní dokumenty."
            : " privacy policy placeholder. Replace this in the Legal settings tab."
        }</p>`,
    },
  ];

  for (const document of documents) {
    const [created] = await tx
      .insert(policyDocuments)
      .values({
        orgId: params.orgId,
        kind: document.kind,
        slug: document.slug,
        title: document.title,
        requiresAcceptance: document.requiresAcceptance,
        sortOrder: document.sortOrder,
      })
      .returning({ id: policyDocuments.id });

    await tx.insert(policyVersions).values({
      documentId: created.id,
      version: "1.0",
      bodyHtml: sanitizePolicyHtml(document.html),
      status: "published",
      isMaterialChange: true,
      effectiveFrom: now,
      publishedAt: now,
    });
  }
}
