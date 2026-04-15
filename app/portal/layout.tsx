import { AuthenticatedAppLayout } from "@/components/app/authenticated-app-layout";

export default function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AuthenticatedAppLayout>{children}</AuthenticatedAppLayout>;
}
