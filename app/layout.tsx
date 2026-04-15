import type { Metadata } from "next";

import { getDictionary } from "@/lib/i18n";
import "./globals.css";

const dictionary = getDictionary();

export const metadata: Metadata = {
  title: dictionary.appName,
  description:
    "A modern operations platform for youth organizations, clubs, and scout troops.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
