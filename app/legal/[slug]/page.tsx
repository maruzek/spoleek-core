import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n";
import { getAppOrganization } from "@/server/queries/app";
import {
  getCurrentPolicyVersion,
  getPolicyDocumentBySlug,
} from "@/server/queries/policies";

/**
 * The version of a legal document currently in force.
 *
 * `body_html` is rendered exactly as it was stored — sanitized once, at publish
 * time. Re-sanitizing here would let the text drift the first time that library
 * is upgraded, and an accepted document has to stay what it was.
 */
export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = getDictionary();
  const organization = await getAppOrganization();

  if (!organization) {
    redirect("/setup");
  }

  const document = await getPolicyDocumentBySlug(organization.id, slug);

  if (!document) {
    notFound();
  }

  const version = await getCurrentPolicyVersion(document.id);

  return (
    <main className="min-h-screen public-surface px-6 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <Button asChild variant="ghost">
            <Link href="/join">
              <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
              {t.legal.backToApplication}
            </Link>
          </Button>
        </div>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{document.title}</CardTitle>
            <CardDescription>
              {organization.name}
              {version?.version ? ` · ${version.version}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {version ? (
              <div
                className="policy-prose"
                // Sanitized server-side at publish time; see
                // server/lib/policy-html.ts.
                dangerouslySetInnerHTML={{ __html: version.bodyHtml }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                This document has not been published yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
