import { redirect } from "next/navigation";

import { PublicShell } from "@/components/public/public-shell";
import { SignInCard } from "@/components/auth/sign-in-card";
import { getServerEnvStatus } from "@/lib/env";
import { defaultLocale, getDictionary } from "@/lib/i18n";
import { getDefaultSignedInRoute } from "@/lib/app-shell";
import { getBootstrapState } from "@/server/queries/bootstrap";
import { getViewerAppContext } from "@/server/queries/access";
import { getViewerSession } from "@/server/queries/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const t = getDictionary();
  const bootstrapState = await getBootstrapState();

  if (!bootstrapState.hasOrganization) {
    redirect("/setup");
  }

  const [envStatus, session] = await Promise.all([
    Promise.resolve(getServerEnvStatus()),
    getViewerSession(),
  ]);

  if (session) {
    const appContext = await getViewerAppContext();
    redirect(getDefaultSignedInRoute(appContext));
  }

  return (
    <PublicShell width="narrow">
      <SignInCard
        locale={defaultLocale}
        organizationName={
          bootstrapState.organization?.name ?? t.common.workspaceFallback
        }
        authStrategy={
          (bootstrapState.organization?.setupAuthStrategy as
            | "email-password"
            | "email-password-google"
            | "google-first") ?? "email-password"
        }
        googleAvailable={envStatus.isGoogleAuthEnabled}
      />
    </PublicShell>
  );
}
