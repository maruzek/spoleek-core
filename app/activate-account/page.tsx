import Link from "next/link";
import { redirect } from "next/navigation";

import { MemberActivationForm } from "@/components/app/member-activation-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { defaultLocale, getDictionary } from "@/lib/i18n";
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
  const t = getDictionary();
  const session = await getViewerSession();

  if (session) {
    redirect("/portal");
  }

  const params = searchParams ? await searchParams : {};
  const memberId = typeof params.member === "string" ? params.member : null;
  const token = typeof params.token === "string" ? params.token : null;
  const error = typeof params.error === "string" ? params.error : null;

  if (!memberId || !token || error) {
    return <InvalidActivationState state="invalid" />;
  }

  await markMemberInviteExpiredIfNeeded(memberId);

  const member = await getInviteMemberForActivation(memberId);

  if (!member || !["invited", "active"].includes(member.status)) {
    return <InvalidActivationState state="invalid" />;
  }

  if (member.inviteStatus === "completed" || (member.userId && member.linkedAt)) {
    return <InvalidActivationState state="completed" />;
  }

  if (member.activationBlockedUntil && member.activationBlockedUntil > new Date()) {
    return (
      <InvalidActivationState
        state="blocked"
        blockedUntil={member.activationBlockedUntil}
      />
    );
  }

  const invite = await getValidMemberInvite({
    memberId,
    token,
  });

  if (!invite) {
    return (
      <InvalidActivationState
        state={member.inviteStatus === "expired" ? "expired" : "invalid"}
      />
    );
  }

  const [customFields, answerMap] = await Promise.all([
    listActiveMemberCustomFields(member.orgId, ["post_approval"]),
    getMemberCustomFieldAnswerMap(member.orgId, member.id),
  ]);

  return (
    <main className="min-h-screen public-surface px-6 py-10 text-foreground">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="flex flex-col justify-center gap-5 py-6">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {t.activation.eyebrow}
          </p>
          <h1 className="max-w-xl text-4xl leading-tight font-semibold text-balance md:text-6xl">
            {t.activation.title}
          </h1>
          <p className="max-w-xl text-base leading-8 text-muted-foreground">
            {t.activation.body(member.organizationName)}
          </p>
          <p className="text-sm leading-7 text-muted-foreground">
            {t.activation.signInEmailLabel}{" "}
            <span className="font-medium text-foreground">{member.email}</span>
          </p>
        </section>

        <MemberActivationForm
          locale={defaultLocale}
          memberId={memberId}
          token={token}
          customFields={customFields}
          customFieldAnswers={answerMap}
        />
      </div>
    </main>
  );
}

function InvalidActivationState({
  state,
  blockedUntil,
}: {
  state: "invalid" | "expired" | "completed" | "blocked";
  blockedUntil?: Date;
}) {
  const t = getDictionary();
  const content = {
    invalid: {
      title: t.activation.invalidTitle,
      description: t.activation.invalidBody,
    },
    expired: {
      title: t.activation.expiredTitle,
      description: t.activation.expiredBody,
    },
    completed: {
      title: t.activation.completedTitle,
      description: t.activation.completedBody,
    },
    blocked: {
      title: t.activation.blockedTitle,
      description: t.activation.blockedBody(
        blockedUntil ? blockedUntil.toLocaleString(t.formatLocale) : null,
      ),
    },
  }[state];

  return (
    <main className="min-h-screen public-surface px-6 py-10 text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Alert variant="destructive">
          <AlertTitle>{content.title}</AlertTitle>
          <AlertDescription>{content.description}</AlertDescription>
        </Alert>
        <div>
          <Button asChild variant="outline">
            <Link href="/login">{t.common.backToSignIn}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
