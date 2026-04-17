import Link from "next/link";
import { redirect } from "next/navigation";

import { MemberActivationForm } from "@/components/app/member-activation-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getViewerSession } from "@/server/queries/auth";
import {
  getMemberCustomFieldAnswerMap,
  listActiveMemberCustomFields,
} from "@/server/queries/member-custom-fields";
import {
  getInviteMemberForActivation,
  getValidMemberInvite,
  markMemberInviteExpiredIfNeeded,
} from "@/server/lib/member-invites";

export default async function ActivateAccountPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getViewerSession();

  if (session) {
    redirect("/portal");
  }

  const params = searchParams ? await searchParams : {};
  const memberId = typeof params.member === "string" ? params.member : null;
  const token = typeof params.token === "string" ? params.token : null;
  const error = typeof params.error === "string" ? params.error : null;

  if (!memberId || !token || error) {
    return <InvalidActivationState />;
  }

  await markMemberInviteExpiredIfNeeded(memberId);

  const member = await getInviteMemberForActivation(memberId);

  if (!member || member.status !== "active") {
    return <InvalidActivationState />;
  }

  const invite = await getValidMemberInvite({
    memberId,
    token,
  });

  if (!invite) {
    return <InvalidActivationState />;
  }

  const [customFields, answerMap] = await Promise.all([
    listActiveMemberCustomFields(member.orgId, ["post_approval"]),
    getMemberCustomFieldAnswerMap(member.orgId, member.id),
  ]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(214,240,224,0.92),_rgba(249,246,238,0.96)_40%,_rgba(244,238,227,1)_100%)] px-6 py-10 text-foreground">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="flex flex-col justify-center gap-5 py-6">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Account activation
          </p>
          <h1 className="max-w-xl text-4xl leading-tight font-semibold text-balance md:text-6xl">
            Finish setting up your member account.
          </h1>
          <p className="max-w-xl text-base leading-8 text-muted-foreground">
            Your membership at {member.organizationName} has been approved. Create your password
            and complete the remaining profile details to enter the member portal.
          </p>
          <p className="text-sm leading-7 text-muted-foreground">
            Sign-in email: <span className="font-medium text-foreground">{member.email}</span>
          </p>
        </section>

        <MemberActivationForm
          memberId={memberId}
          token={token}
          customFields={customFields}
          customFieldAnswers={answerMap}
        />
      </div>
    </main>
  );
}

function InvalidActivationState() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(214,240,224,0.92),_rgba(249,246,238,0.96)_40%,_rgba(244,238,227,1)_100%)] px-6 py-10 text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Alert variant="destructive">
          <AlertTitle>This activation link is invalid or has expired.</AlertTitle>
          <AlertDescription>
            Ask an organization administrator to send you a fresh invitation email, then open the
            newest link they send.
          </AlertDescription>
        </Alert>
        <div>
          <Button asChild variant="outline">
            <Link href="/">Back to sign in</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
