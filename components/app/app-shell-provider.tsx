"use client";

import { createContext, useContext, ReactNode } from "react";
import type { AppShellContext } from "@/lib/app-shell";

const AppShellContextInstance = createContext<AppShellContext | null>(null);

export function AppShellProvider({
  children,
  context,
}: {
  children: ReactNode;
  context: AppShellContext;
}) {
  return (
    <AppShellContextInstance.Provider value={context}>
      {children}
    </AppShellContextInstance.Provider>
  );
}

export function useAppShell() {
  const context = useContext(AppShellContextInstance);

  if (!context) {
    throw new Error("useAppShell must be used within an AppShellProvider");
  }

  return context;
}
