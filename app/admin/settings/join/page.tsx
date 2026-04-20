import { redirect } from "next/navigation";

export default function AdminJoinSettingsPage() {
  redirect("/admin/settings?tab=join");
}
