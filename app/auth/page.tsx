import { redirect } from "next/navigation";

// Older invite emails link here.
export default function AuthAliasPage() {
  redirect("/login");
}
