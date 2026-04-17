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
  advanced: {
    backgroundTasks: {
      handler: (promise) => {
        after(async () => {
          await promise;
        });
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
            throw new Error("Invite email could not be sent because the member has no email.");
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
          await inviteTools.markMemberInviteFailed({
            memberId: activationTarget.memberId,
            error: error instanceof Error ? error.message : "Failed to send member invite email.",
          });
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
        },
      }
    : {},
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
