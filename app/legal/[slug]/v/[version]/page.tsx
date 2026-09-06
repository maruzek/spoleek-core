import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { getAppOrganization } from "@/server/queries/app";
import {
  getPolicyDocumentBySlug,
  getPolicyVersionByLabel,
} from "@/server/queries/policies";

/**
 * One specific version of a legal document, verbatim.
 *
 * This route is what makes an acknowledgement record mean anything: a member —
 * or a regulator — can read the exact text that was accepted on a given date,
 * rather than today's replacement for it. Every acknowledgement in the admin UI
 * links here.
 */
export default async function LegalDocumentVersionPage({
  params,
}: {
  params: Promise<{ slug: string; version: string }>;
}) {
  const { slug, version: versionLabel } = await params;
  const t = getDictionary();
  const organization = await getAppOrganization();

  if (!organization) {
    redirect("/setup");
  }

  const document = await getPolicyDocumentBySlug(organization.id, slug);

  if (!document) {
    notFound();
  }

  const version = await getPolicyVersionByLabel(
    document.id,
    decodeURIComponent(versionLabel),
  );

  if (!version) {
    notFound();
  }

  const isSuperseded = version.status === "archived";

  return (
    <main className="min-h-screen public-surface px-6 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div>
          <Button asChild variant="ghost">
            <Link href={`/legal/${document.slug}`}>
              <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
              {t.legal.backToApplication}
            </Link>
          </Button>
        </div>

        {isSuperseded ? (
          <Alert>
            <AlertTitle>This version is no longer in force</AlertTitle>
            <AlertDescription>
              You are reading version {version.version}, kept on record because
              members accepted it.{" "}
              <Link
                href={`/legal/${document.slug}`}
                className="underline underline-offset-4"
              >
                Read the current version
              </Link>
              .
            </AlertDescription>
          </Alert>
        ) : null}

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{document.title}</CardTitle>
            <CardDescription>
              {organization.name} · version {version.version}
              {version.effectiveFrom
                ? ` · in force from ${formatDateTime(version.effectiveFrom)}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {version.summaryOfChanges ? (
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">What changed: </strong>
                {version.summaryOfChanges}
              </p>
            ) : null}
            <div
              className="policy-prose"
              // Sanitized server-side at publish time; never re-transformed on
              // read, so this renders exactly what was accepted.
              dangerouslySetInnerHTML={{ __html: version.bodyHtml }}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
