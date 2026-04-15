import { redirect } from "next/navigation";

import { SetupWizard } from "@/components/setup/setup-wizard";
import { getServerEnvStatus } from "@/lib/env";
import {
  deriveSetupStep,
  getBootstrapState,
  getSetupEnvReadiness,
  getSetupInstructions,
  getSetupViewerSessionSafe,
  getSetupWizardState,
} from "@/server/queries/bootstrap";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const bootstrapState = await getBootstrapState();

  if (bootstrapState.hasOrganization) {
    redirect("/");
  }

  const wizardState = await getSetupWizardState();
  const envStatus = getServerEnvStatus();
  const instructions =
    wizardState.deploymentTrack && wizardState.authStrategy
      ? getSetupInstructions(wizardState.deploymentTrack, wizardState.authStrategy)
      : null;
  const envReadiness =
    wizardState.deploymentTrack && wizardState.authStrategy
      ? await getSetupEnvReadiness(wizardState)
      : null;
  const viewer =
    wizardState.envValidated
      ? await getSetupViewerSessionSafe()
      : null;
  const currentStep = deriveSetupStep(wizardState, {
    hasAdminSession: Boolean(viewer && wizardState.adminUserId === viewer.user.id),
  });

  return (
    <SetupWizard
      currentStep={currentStep}
      state={wizardState}
      envReadiness={envReadiness}
      instructions={instructions}
      viewer={viewer ? { email: viewer.user.email, name: viewer.user.name } : null}
      googleAvailable={envStatus.isGoogleAuthEnabled}
      databaseIssue={bootstrapState.databaseIssue}
    />
  );
}
