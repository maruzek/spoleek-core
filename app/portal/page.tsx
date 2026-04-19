import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";

import { AppPage } from "@/components/app/app-page";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requireCurrentMemberAccess } from "@/server/queries/access";
import { getPendingPaymentsForMember } from "@/server/queries/payments";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="uppercase tracking-[0.18em]">{label}</CardDescription>
        <CardTitle className="text-sm capitalize">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default async function PortalOverviewPage() {
  const { member, organization, session } = await requireCurrentMemberAccess({
    requireProfileComplete: true,
  });

  const pendingPayments = await getPendingPaymentsForMember(organization.id, member.id);
  const hasOverdue = pendingPayments.some((p) => p.status === "overdue");

  return (
    <AppPage
      eyebrow="Member portal"
      title={`Welcome back, ${session.user.name}`}
      description="The portal stays focused on self-service: your membership status, your core profile data, and the tools you use directly."
      actions={
        <Button asChild variant="outline">
          <Link href="/portal/profile">Edit profile</Link>
        </Button>
      }
    >
      {pendingPayments.length > 0 ? (
        <Alert variant={hasOverdue ? "destructive" : "default"}>
          <AlertTriangleIcon />
          <AlertTitle>{hasOverdue ? "Payment overdue" : "Payment due"}</AlertTitle>
          <AlertDescription>
            You have {pendingPayments.length} membership fee payment
            {pendingPayments.length > 1 ? "s" : ""} pending.
          </AlertDescription>
          <AlertAction>
            <Button asChild size="sm" variant="outline">
              <Link href="/portal/payments">View payments</Link>
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{organization.name}</CardTitle>
            <CardDescription>
              Your member portal and self-service profile area.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Fact label="Membership status" value={member.status} />
            <Fact label="Role" value={member.role.replace("_", " ")} />
            <Fact
              label="Policies accepted"
              value={
                member.acceptedTermsAt && member.acceptedPrivacyAt ? "Yes" : "Pending"
              }
            />
            <Fact label="Linked at" value={formatDateTime(member.linkedAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What changed</CardTitle>
            <CardDescription>
              Portal and administration now share the same application frame, while
              keeping their responsibilities separate.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm leading-6 text-muted-foreground">
            <p>
              Your portal remains focused on your own information, event
              participation, and personal workflows.
            </p>
            <p>
              Administrative tools now live in a separate management section, so the
              member-facing experience stays calmer and easier to navigate.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Profile</Badge>
              <Badge variant="secondary">Events</Badge>
              <Badge variant="secondary">Forms</Badge>
              <Badge variant="secondary">Payments</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppPage>
  );
}
