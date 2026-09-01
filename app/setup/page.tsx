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
  getSetupWorkspaceConnectState,
} from "@/server/queries/bootstrap";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [bootstrapState, wizardState] = await Promise.all([
    getBootstrapState(),
    getSetupWizardState(),
  ]);

  // The Workspace track keeps the wizard open past org creation so the OAuth
  // grant — which needs a real orgId — can finish inside setup.
  const isConnectStage =
    Boolean(wizardState.organizationId) &&
    bootstrapState.organization?.id === wizardState.organizationId;

  if (bootstrapState.hasOrganization && !isConnectStage) {
    redirect("/");
  }

  const envStatus = getServerEnvStatus();
  const instructions =
    wizardState.deploymentTrack && wizardState.authStrategy
      ? getSetupInstructions(wizardState.deploymentTrack, wizardState.authStrategy)
      : null;
  const envReadiness =
    !isConnectStage && wizardState.deploymentTrack && wizardState.authStrategy
      ? await getSetupEnvReadiness(wizardState)
      : null;
  const viewer =
    wizardState.envValidated
      ? await getSetupViewerSessionSafe()
      : null;
  const workspaceConnectState = isConnectStage
    ? await getSetupWorkspaceConnectState(wizardState.organizationId!)
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
      workspaceConnectState={workspaceConnectState}
    />
  );
}
