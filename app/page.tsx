import { redirect } from "next/navigation";

import { getDefaultSignedInRoute } from "@/lib/app-shell";
import { getBootstrapState } from "@/server/queries/bootstrap";
import { getViewerAppContext } from "@/server/queries/access";
import { getViewerSession } from "@/server/queries/auth";

export const dynamic = "force-dynamic";

// Self-hosted deployments have no marketing page, so "/" is only a router:
// setup wizard, the signed-in landing route, or /login. A SaaS build can
// later render its landing page here without touching the auth pages.
export default async function Home() {
  const bootstrapState = await getBootstrapState();

  if (!bootstrapState.hasOrganization) {
    redirect("/setup");
  }

  const session = await getViewerSession();

  if (session) {
    const appContext = await getViewerAppContext();
    redirect(getDefaultSignedInRoute(appContext));
  }

  redirect("/login");
}
