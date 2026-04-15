import { redirect } from "next/navigation";

import { RootAuthPanel } from "@/components/auth/root-auth-panel";
import { getServerEnvStatus } from "@/lib/env";
import { getDefaultSignedInRoute } from "@/lib/app-shell";
import { getBootstrapState } from "@/server/queries/bootstrap";
import { getViewerAppContext } from "@/server/queries/access";
import { getViewerSession } from "@/server/queries/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
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
    <RootAuthPanel
      authStrategy={
        (bootstrapState.organization?.setupAuthStrategy as
          | "email-password"
          | "email-password-google"
          | "google-first") ?? "email-password"
      }
      googleAvailable={envStatus.isGoogleAuthEnabled}
    />
  );
}
