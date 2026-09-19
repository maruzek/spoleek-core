import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";

import { MemberActivationEmail } from "@/emails/member-activation-email";
import { getServerEnv } from "@/lib/env";
import { getDictionary } from "@/lib/i18n";
import { db } from "@/server/db";
import { schema } from "@/server/db/schema";

const env = getServerEnv();

export const auth = betterAuth({
  appName: env.APP_NAME,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  session: {
    // Stated rather than inherited. Seven days with a daily refresh is what the
    // library defaults to; the point is that the number is now a decision the
    // privacy notice can quote, not an implementation detail of a dependency.
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    ipAddress: {
      // Nothing in the application ever reads `sessions.ip_address` — a
      // repo-wide search finds only the schema line — so collecting it has no
      // purpose to justify it. Better Auth still writes the column, now always
      // empty. `user_agent` has no equivalent switch and is written
      // unconditionally; both rows go away on the session retention rule.
      disableIpTracking: true,
    },
    backgroundTasks: {
      handler: (promise) => {
        after(async () => {
          await promise;
        });
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const { linkUserToWorkspaceMember } = await import(
            "@/server/lib/workspace/link-user-to-member"
          );
          await linkUserToWorkspaceMember({ id: user.id, email: user.email }).catch(
            () => undefined,
          );
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 256,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url, token }) => {
      // Dynamic: these modules reach back into `auth`, and the mailer door
      // records to the database, which this module must not pull in at load.
      const inviteTools = await import("@/server/lib/member-invites");
      const { sendEmail } = await import("@/server/notifications/send");
      const activationTarget = inviteTools.isMemberActivationResetUrl(url);

      if (activationTarget) {
        const { memberId } = activationTarget;
        const emailContent = await inviteTools
          .getMemberInviteEmailContent(memberId)
          .catch(() => null);
        const existingInvite = await inviteTools.getMemberInviteByMemberId(memberId);

        const fail = async (message: string): Promise<never> => {
          await inviteTools.markMemberInviteFailed({ memberId, error: message });
          throw new Error(message);
        };

        if (!emailContent) {
          return fail("Invite email could not be prepared because the member was not found.");
        }
        if (!emailContent.email) {
          return fail("Invite email could not be sent because the member has no email.");
        }

        const { getLatestInviteEmailActivity } = await import("@/server/lib/email-activity");
        const previousActivity = await getLatestInviteEmailActivity(memberId);

        const result = await sendEmail({
          orgId: emailContent.orgId,
          kind: "member_activation_invite",
          to: { email: emailContent.email, name: emailContent.memberName, memberId },
          inviteId: existingInvite?.id ?? null,
          resendOfActivityId: previousActivity?.id ?? null,
          metadata: { organizationName: emailContent.organizationName },
          subject: emailContent.subject,
          react: MemberActivationEmail({
            organizationName: emailContent.organizationName,
            subject: emailContent.subject,
            body: emailContent.body,
            activationUrl: url,
            memberName: emailContent.memberName || user.name,
            payment: emailContent.payment,
          }),
          idempotencyKey: `member-activation/${memberId}/${token}`,
        });

        if (!result.sent) {
          return fail(result.error);
        }

        await inviteTools.markMemberInviteSent({
          memberId,
          token,
          providerEmailId: result.providerEmailId,
        });
        if (existingInvite) {
          await inviteTools
            .logMemberAuthEvent({
              orgId: existingInvite.orgId,
              memberId,
              inviteId: existingInvite.id,
              actorUserId: null,
              eventType: "password_reset_sent",
              metadata: { providerEmailId: result.providerEmailId },
            })
            .catch(() => undefined);
        }
        return;
      }

      // A plain reset is logged under the org the account belongs to — the
      // subject only, never the link. An account with no member row (a
      // system admin) falls back to the app's organization.
      const { resolveMembershipForUser } = await import("@/server/queries/app");
      const membership = await resolveMembershipForUser(user.id);
      if (!membership) {
        throw new Error("Password reset email could not be sent: no organization exists.");
      }

      const copy = getDictionary().emails.passwordReset;
      const result = await sendEmail({
        orgId: membership.orgId,
        kind: "password_reset",
        to: { email: user.email, name: user.name, memberId: membership.memberId },
        subject: copy.subject(env.APP_NAME),
        text: copy.body(url),
        idempotencyKey: `password-reset/${user.id}/${token}`,
      });

      if (!result.sent) {
        throw new Error(result.error);
      }
    },
  },
  socialProviders: env.isGoogleAuthEnabled
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
        },
      }
    : {},
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
