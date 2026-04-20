import { redirect } from "next/navigation";

export default function AdminWorkspaceSettingsPage() {
  redirect("/admin/settings?tab=workspace");
}
