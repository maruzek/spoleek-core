import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";

import { MemberActivationEmail } from "@/emails/member-activation-email";
import { getServerEnv } from "@/lib/env";
import { getResendClient, getResendFromEmail } from "@/server/lib/email";
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
      const inviteTools = await import("@/server/lib/member-invites");
      const emailActivityTools = await import("@/server/lib/email-activity");
      const activationTarget = inviteTools.isMemberActivationResetUrl(url);
      const resend = getResendClient();
      const from = getResendFromEmail();

      if (activationTarget) {
        try {
          const emailContent = await inviteTools.getMemberInviteEmailContent(
            activationTarget.memberId,
          );
          const existingInvite = await inviteTools.getMemberInviteByMemberId(
            activationTarget.memberId,
          );

          if (!emailContent.email) {
            throw new Error(
              "Invite email could not be sent because the member has no email.",
            );
          }

          const { data, error } = await resend.emails.send(
            {
              from,
              to: [emailContent.email],
              subject: emailContent.subject,
              react: MemberActivationEmail({
                organizationName: emailContent.organizationName,
                subject: emailContent.subject,
                body: emailContent.body,
                activationUrl: url,
                memberName: emailContent.memberName || user.name,
                payment: emailContent.payment,
              }),
            },
            {
              idempotencyKey: `member-activation/${activationTarget.memberId}/${token}`,
            },
          );

          if (error) {
            throw new Error(error.message);
          }

          await inviteTools.markMemberInviteSent({
            memberId: activationTarget.memberId,
            token,
            providerEmailId: data?.id ?? null,
          });
          await emailActivityTools.recordMemberInviteEmailSent({
            memberId: activationTarget.memberId,
            providerEmailId: data?.id ?? null,
            fromEmail: from,
            toEmail: emailContent.email,
            toName: emailContent.memberName,
            subject: emailContent.subject,
            metadata: {
              organizationName: emailContent.organizationName,
            },
          });
          if (existingInvite) {
            await inviteTools
              .logMemberAuthEvent({
                orgId: existingInvite.orgId,
                memberId: activationTarget.memberId,
                inviteId: existingInvite.id,
                actorUserId: null,
                eventType: "password_reset_sent",
                metadata: {
                  providerEmailId: data?.id ?? null,
                },
              })
              .catch(() => undefined);
          }
          return;
        } catch (error) {
          const emailContent = await inviteTools
            .getMemberInviteEmailContent(activationTarget.memberId)
            .catch(() => null);
          await inviteTools.markMemberInviteFailed({
            memberId: activationTarget.memberId,
            error:
              error instanceof Error
                ? error.message
                : "Failed to send member invite email.",
          });
          if (emailContent?.email) {
            await emailActivityTools.recordMemberInviteEmailFailed({
              memberId: activationTarget.memberId,
              fromEmail: from,
              toEmail: emailContent.email,
              toName: emailContent.memberName,
              subject: emailContent.subject,
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to send member invite email.",
              metadata: {
                organizationName: emailContent.organizationName,
              },
            });
          }
          throw error;
        }
      }

      const { error } = await resend.emails.send(
        {
          from,
          to: [user.email],
          subject: `${env.APP_NAME}: reset your password`,
          text: `Open this link to reset your password: ${url}`,
        },
        {
          idempotencyKey: `password-reset/${user.id}/${token}`,
        },
      );

      if (error) {
        throw new Error(error.message);
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
