import { AppPage } from "@/components/app/app-page";
import { ProfileForm } from "@/components/app/profile-form";
import { requireCurrentMemberAccess } from "@/server/queries/access";

export default async function PortalProfilePage() {
  const { member } = await requireCurrentMemberAccess();

  return (
    <AppPage
      eyebrow="Member portal"
      title="Manage your profile."
      description="Keep your core contact information current so admins do not need to chase manual updates."
    >
      <ProfileForm
        fullName={member.fullName}
        phone={member.phone}
        addressLine1={member.addressLine1}
        addressLine2={member.addressLine2}
        city={member.city}
        postalCode={member.postalCode}
        countryCode={member.countryCode}
      />
    </AppPage>
  );
}
