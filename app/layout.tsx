import type { Metadata, Viewport } from "next";

import { getDictionary } from "@/lib/i18n";
import "./globals.css";
import { Geist, Lora } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const loraHeading = Lora({ subsets: ["latin"], variable: "--font-heading" });

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const dictionary = getDictionary();

export const metadata: Metadata = {
  title: dictionary.appName,
  description:
    "A modern operations platform for youth organizations, clubs, and scout troops.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4eee3" },
    { media: "(prefers-color-scheme: dark)", color: "#161510" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // next-themes writes the class on <html> before paint, which React cannot
    // see during hydration — hence suppressHydrationWarning.
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full antialiased",
        "font-sans",
        geist.variable,
        loraHeading.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        {/* Mounted at the root so signed-out pages are themed too. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
