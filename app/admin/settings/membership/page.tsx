import { redirect } from "next/navigation";

export default function AdminMembershipSettingsPage() {
  redirect("/admin/settings?tab=membership");
}
